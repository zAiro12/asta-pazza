import type { PlayerWithGoods } from '@/types/game';

/**
 * Condizione di un obiettivo (campo `condition` dal DB).
 */
export type ObjectiveCondition =
  | { type: 'min_goods'; count: number }
  | { type: 'min_goods_in_category'; categoryId: number; count: number }
  | { type: 'all_goods_in_category'; categoryId: number }
  | { type: 'min_categories'; count: number }
  | { type: 'min_credits'; amount: number }
  | { type: 'no_goods_in_category'; categoryId: number }
  | { type: 'min_base_category_goods'; count: number }
  | { type: 'min_total_value'; amount: number }
  | { type: 'always' }
  // ── Nuovi tipi per comuni e rari ──────────────────────────────────────────
  | { type: 'min_base_category_goods_and_category'; count: number; otherCategoryId: number; otherCount: number }
  | { type: 'min_good_value'; value: number; count: number }
  | { type: 'min_credits_and_goods'; credits: number; goods: number }
  | { type: 'min_mini_collections_and_credits'; collections: number; credits: number }
  | { type: 'min_mini_collections_outside_base'; count: number }
  | { type: 'min_mini_collections'; count: number }
  | { type: 'min_complete_collections'; count: number }
  | { type: 'min_complete_collections_and_credits'; collections: number; credits: number }
  | { type: 'min_mini_collections_and_goods'; collections: number; extraGoods: number }
  | { type: 'complete_and_mini_and_credits'; complete: number; mini: number; credits: number }
  | { type: 'max_goods_and_min_credits'; maxGoods: number; credits: number }
  | { type: 'min_mini_collections_and_max_credits'; collections: number; maxCredits: number }
  | { type: 'min_categories_and_credits'; categories: number; credits: number }
  | { type: 'min_categories_with_count'; categoriesCount: number; goodsPerCategory: number }
  | { type: 'multi_category_min'; requirements: { categoryId: number; count: number }[] }
  | { type: 'specific_good_and_categories'; goodId: number; categories: { categoryId: number; count: number }[] }
  | { type: 'no_scugnizzu_and_min_credits'; credits: number }
  | { type: 'most_credits' }
  | { type: 'highest_value_good' }
  | { type: 'top_good_in_categories'; count: number }
  | { type: 'conglomerato' }
  | { type: 'base_plus_other'; baseCount: number; otherCount: number }
  | { type: 'equilibrio_perfetto' }
  | { type: 'min_majorities'; count: number }
  | { type: 'tycoon' }
  | { type: 'elite_collector' }
  | { type: 'magnate_culturale' };

export interface ObjectiveRow {
  id: number;
  name: string;
  type: string;
  description: string;
  rewardPoints: number;
  condition: ObjectiveCondition | null;
}

/**
 * Tipi di condizione che richiedono il confronto tra tutti i giocatori
 * e/o che possono ancora cambiare fino all'ultimo turno.
 * Questi obiettivi vengono valutati SOLO a fine partita.
 */
const END_OF_GAME_CONDITION_TYPES = new Set([
  'most_credits',
  'highest_value_good',
  'top_good_in_categories',
  'min_majorities',
  'tycoon',
  'conglomerato',
  'base_plus_other',
  'equilibrio_perfetto',
  'magnate_culturale',
]);

/**
 * Restituisce true se il tipo di condizione è valutabile solo a fine partita
 * (richiede confronto tra giocatori o dipende da assenza di acquisti futuri).
 */
export function isEndOfGameObjective(conditionType: string | null | undefined): boolean {
  if (!conditionType) return false;
  return END_OF_GAME_CONDITION_TYPES.has(conditionType);
}

/** Conta quante mini-collezioni (>=2 beni su 3) ha il giocatore */
function countMiniCollections(goodsByCategory: Map<number, number>, goodsInCategory: Map<number, number>): number {
  let count = 0;
  for (const [catId, playerHas] of goodsByCategory) {
    const total = goodsInCategory.get(catId) ?? 3;
    if (playerHas >= 2 && playerHas < total) count++;
  }
  return count;
}

/** Conta quante collezioni complete ha il giocatore */
function countCompleteCollections(goodsByCategory: Map<number, number>, goodsInCategory: Map<number, number>): number {
  let count = 0;
  for (const [catId, playerHas] of goodsByCategory) {
    const total = goodsInCategory.get(catId) ?? 3;
    if (total > 0 && playerHas >= total) count++;
  }
  return count;
}

/**
 * Valuta se un giocatore ha completato un dato obiettivo.
 * `goodsInCategory` mappa categoryId -> numero totale di beni nel DB per quella categoria.
 * `allPlayers` serve per condizioni comparative (most_credits, highest_value_good, ecc.).
 */
export function evaluateObjective(
  player: PlayerWithGoods,
  objective: ObjectiveRow,
  goodsInCategory: Map<number, number>,
  allPlayers?: PlayerWithGoods[],
): boolean {
  const cond = objective.condition;
  if (!cond || cond.type === 'always') return true;

  const goodsByCategory = new Map<number, number>();
  for (const g of player.goods) {
    goodsByCategory.set(g.categoryId, (goodsByCategory.get(g.categoryId) ?? 0) + 1);
  }

  const miniCollections = countMiniCollections(goodsByCategory, goodsInCategory);
  const completeCollections = countCompleteCollections(goodsByCategory, goodsInCategory);

  switch (cond.type) {
    case 'min_goods':
      return player.goods.length >= cond.count;

    case 'min_goods_in_category':
      return (goodsByCategory.get(cond.categoryId) ?? 0) >= cond.count;

    case 'all_goods_in_category': {
      const totalInCat = goodsInCategory.get(cond.categoryId) ?? 0;
      const playerHas = goodsByCategory.get(cond.categoryId) ?? 0;
      return totalInCat > 0 && playerHas >= totalInCat;
    }

    case 'min_categories':
      return goodsByCategory.size >= cond.count;

    case 'min_credits':
      return player.credits >= cond.amount;

    case 'no_goods_in_category':
      return !goodsByCategory.has(cond.categoryId);

    case 'min_base_category_goods': {
      if (!player.baseCategoryId) return false;
      return (goodsByCategory.get(player.baseCategoryId) ?? 0) >= cond.count;
    }

    case 'min_total_value': {
      const total = player.goods.reduce((s, g) => s + g.baseValue, 0);
      return total >= cond.amount;
    }

    case 'min_base_category_goods_and_category': {
      if (!player.baseCategoryId) return false;
      const baseOk = (goodsByCategory.get(player.baseCategoryId) ?? 0) >= cond.count;
      const otherOk = (goodsByCategory.get(cond.otherCategoryId) ?? 0) >= cond.otherCount;
      return baseOk && otherOk;
    }

    case 'min_good_value': {
      const qualifying = player.goods.filter(g => g.baseValue >= cond.value);
      return qualifying.length >= cond.count;
    }

    case 'min_credits_and_goods':
      return player.credits >= cond.credits && player.goods.length >= cond.goods;

    case 'min_mini_collections_and_credits':
      return miniCollections >= cond.collections && player.credits >= cond.credits;

    case 'min_mini_collections_outside_base': {
      let count = 0;
      for (const [catId, playerHas] of goodsByCategory) {
        if (catId === player.baseCategoryId) continue;
        const total = goodsInCategory.get(catId) ?? 3;
        if (playerHas >= 2 && playerHas < total) count++;
      }
      return count >= cond.count;
    }

    case 'min_mini_collections':
      return miniCollections >= cond.count;

    case 'min_complete_collections':
      return completeCollections >= cond.count;

    case 'min_complete_collections_and_credits':
      return completeCollections >= cond.collections && player.credits >= cond.credits;

    case 'min_mini_collections_and_goods': {
      const totalGoods = player.goods.length;
      let goodsInMini = 0;
      for (const [catId, playerHas] of goodsByCategory) {
        const total = goodsInCategory.get(catId) ?? 3;
        if (playerHas >= 2 && playerHas < total) goodsInMini += playerHas;
      }
      return miniCollections >= cond.collections && (totalGoods - goodsInMini) >= cond.extraGoods;
    }

    case 'complete_and_mini_and_credits':
      return completeCollections >= cond.complete && miniCollections >= cond.mini && player.credits >= cond.credits;

    case 'max_goods_and_min_credits':
      return player.goods.length <= cond.maxGoods && player.credits >= cond.credits;

    case 'min_mini_collections_and_max_credits':
      return miniCollections >= cond.collections && player.credits <= cond.maxCredits;

    case 'min_categories_and_credits':
      return goodsByCategory.size >= cond.categories && player.credits >= cond.credits;

    case 'min_categories_with_count': {
      let qualifying = 0;
      for (const count of goodsByCategory.values()) {
        if (count >= cond.goodsPerCategory) qualifying++;
      }
      return qualifying >= cond.categoriesCount;
    }

    case 'multi_category_min':
      return cond.requirements.every(req => (goodsByCategory.get(req.categoryId) ?? 0) >= req.count);

    case 'specific_good_and_categories': {
      const hasGood = player.goods.some(g => g.id === cond.goodId);
      if (!hasGood) return false;
      return cond.categories.every(req => (goodsByCategory.get(req.categoryId) ?? 0) >= req.count);
    }

    case 'no_scugnizzu_and_min_credits':
      return !player.usedScugnizzu && player.credits >= cond.credits;

    case 'most_credits': {
      if (!allPlayers || allPlayers.length === 0) return false;
      const maxCredits = Math.max(...allPlayers.map(p => p.credits));
      return player.credits >= maxCredits;
    }

    case 'highest_value_good': {
      if (!allPlayers || allPlayers.length === 0) return false;
      const myMax = player.goods.length > 0 ? Math.max(...player.goods.map(g => g.baseValue)) : -1;
      const globalMax = Math.max(...allPlayers.flatMap(p => p.goods.map(g => g.baseValue)));
      return myMax >= globalMax && myMax >= 0;
    }

    case 'top_good_in_categories': {
      if (!allPlayers || allPlayers.length === 0) return false;
      const maxValueInCat = new Map<number, number>();
      for (const p of allPlayers) {
        for (const g of p.goods) {
          maxValueInCat.set(g.categoryId, Math.max(maxValueInCat.get(g.categoryId) ?? 0, g.baseValue));
        }
      }
      let dominated = 0;
      for (const g of player.goods) {
        if (g.baseValue >= (maxValueInCat.get(g.categoryId) ?? 0)) dominated++;
      }
      return dominated >= cond.count;
    }

    case 'conglomerato': {
      if (!player.baseCategoryId) return false;
      const base = goodsByCategory.get(player.baseCategoryId) ?? 0;
      if (base < 2) return false;
      const others = [...goodsByCategory.entries()]
        .filter(([catId]) => catId !== player.baseCategoryId)
        .map(([, cnt]) => cnt)
        .sort((a, b) => b - a);
      return others.length >= 2 && others[0] >= 2 && others[1] >= 1;
    }

    case 'base_plus_other': {
      if (!player.baseCategoryId) return false;
      const base = goodsByCategory.get(player.baseCategoryId) ?? 0;
      if (base < cond.baseCount) return false;
      const hasOther = [...goodsByCategory.entries()]
        .some(([catId, cnt]) => catId !== player.baseCategoryId && cnt >= cond.otherCount);
      return hasOther;
    }

    case 'equilibrio_perfetto': {
      return [...goodsByCategory.values()].every(cnt => cnt <= 1);
    }

    case 'min_majorities': {
      if (!allPlayers || allPlayers.length === 0) return false;
      let majorities = 0;
      for (const [catId, playerHas] of goodsByCategory) {
        const maxOther = Math.max(0, ...allPlayers
          .filter(p => p.id !== player.id)
          .map(p => p.goods.filter(g => g.categoryId === catId).length));
        if (playerHas > maxOther) majorities++;
      }
      return majorities >= cond.count;
    }

    case 'tycoon': {
      if (!allPlayers || allPlayers.length === 0) return false;
      if (completeCollections < 1) return false;
      let hasMajority = false;
      for (const [catId, playerHas] of goodsByCategory) {
        const maxOther = Math.max(0, ...allPlayers
          .filter(p => p.id !== player.id)
          .map(p => p.goods.filter(g => g.categoryId === catId).length));
        if (playerHas > maxOther) { hasMajority = true; break; }
      }
      return hasMajority;
    }

    case 'elite_collector': {
      const highValue = player.goods.filter(g => g.baseValue >= 25).length;
      const lowValue = player.goods.filter(g => g.baseValue <= 20).length;
      return highValue >= 1 && lowValue >= 2;
    }

    case 'magnate_culturale': {
      if (!player.baseCategoryId) return false;
      const base = goodsByCategory.get(player.baseCategoryId) ?? 0;
      if (base < 2) return false;
      const others = [...goodsByCategory.entries()]
        .filter(([catId]) => catId !== player.baseCategoryId)
        .filter(([, cnt]) => cnt >= 2);
      return others.length >= 2;
    }

    default:
      return false;
  }
}

/**
 * Ritorna gli id degli obiettivi completati da un giocatore.
 * Se `onlyImmediate` è true, esclude i tipi end-of-game.
 * Se `onlyEndOfGame` è true, include solo i tipi end-of-game.
 */
export function getCompletedObjectiveIds(
  player: PlayerWithGoods,
  allObjectives: ObjectiveRow[],
  goodsInCategory: Map<number, number>,
  allPlayers?: PlayerWithGoods[],
  options?: { onlyImmediate?: boolean; onlyEndOfGame?: boolean },
): number[] {
  const { onlyImmediate = false, onlyEndOfGame = false } = options ?? {};

  return allObjectives
    .filter(obj => {
      const condType = obj.condition?.type ?? null;
      if (onlyImmediate && isEndOfGameObjective(condType)) return false;
      if (onlyEndOfGame && !isEndOfGameObjective(condType)) return false;
      return evaluateObjective(player, obj, goodsInCategory, allPlayers);
    })
    .map(obj => obj.id);
}
