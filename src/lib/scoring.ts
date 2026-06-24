import type { PlayerWithGoods, Game, GameEvent, ScoreBreakdown, EventEffect } from '@/types/game';

const BASE_CATEGORY_BONUS = 10;
const MINI_COLLECTION_POINTS = 10;   // 2 beni su 3 stessa categoria
const FULL_COLLECTION_POINTS = 20;   // 3 beni su 3 stessa categoria
const MAJORITY_POINTS = 25;
const SCUGNIZZU_PENALTY = -15;

interface CollectionState {
  miniBonus: number;
  fullBonus: number;
  majorityBonus: number;
  miniCount: number;
  fullCount: number;
}

/**
 * Calcola il punteggio completo di un giocatore.
 * @param player - Il giocatore con i suoi beni
 * @param allPlayers - Tutti i giocatori della partita (per il calcolo della maggioranza)
 * @param activeEvents - Lista degli eventi permanenti attivi
 * @param completedObjectivesPoints - Somma dei punti degli obiettivi completati (calcolata esternamente)
 */
export function calculateScore(
  player: PlayerWithGoods,
  allPlayers: PlayerWithGoods[],
  activeEvents: GameEvent[],
  completedObjectivesPoints = 0,
): ScoreBreakdown {
  const goodsPerCategory = groupByCategory(player.goods.map(g => g.categoryId));
  const allPlayersGoodsPerCategory = allPlayers.map(p => groupByCategory(p.goods.map(g => g.categoryId)));

  // --- Valore beni + bonus categoria base + modificatori eventi ---
  let goodsValue = 0;
  let baseCategoryBonus = 0;
  let eventModifiers = 0;

  // category_merge: costruiamo una mappa categoryId -> categoryId "canonica"
  const mergeMap = buildCategoryMergeMap(activeEvents);

  for (const good of player.goods) {
    let value = good.baseValue;

    // Applica eventi permanenti che modificano il valore dei beni
    for (const event of activeEvents) {
      const effect = event.effect as EventEffect;

      if (effect.type === 'category_bonus' && effect.categoryName === good.categoryName) {
        value += effect.delta;
        eventModifiers += effect.delta;
      }
      if (effect.type === 'all_goods_bonus') {
        value += effect.delta;
        eventModifiers += effect.delta;
      }
      if (effect.type === 'value_threshold_bonus') {
        const qualifies = effect.above
          ? good.baseValue >= effect.threshold
          : good.baseValue <= effect.threshold;
        if (qualifies) {
          value += effect.delta;
          eventModifiers += effect.delta;
        }
      }
      if (effect.type === 'secret_category_bonus' && 'categoryName' in effect && (effect as any).categoryName === good.categoryName) {
        value += effect.delta;
        eventModifiers += effect.delta;
      }
    }

    goodsValue += value;

    // Bonus categoria base (+10 per ogni bene della propria categoria)
    const effectiveCategoryId = mergeMap.get(good.categoryId) ?? good.categoryId;
    const effectiveBaseId = player.baseCategoryId
      ? (mergeMap.get(player.baseCategoryId) ?? player.baseCategoryId)
      : null;
    if (effectiveBaseId !== null && effectiveCategoryId === effectiveBaseId) {
      baseCategoryBonus += BASE_CATEGORY_BONUS;
    }
  }

  // --- Collezioni (con merge) ---
  const mergedPlayerCats = groupByCategoryWithMerge(player.goods.map(g => g.categoryId), mergeMap);
  // Escludi il giocatore corrente dall'array degli altri per il calcolo maggioranza
  const otherPlayers = allPlayers.filter(p => p.id !== player.id);
  const mergedOtherPlayerCats = otherPlayers.map(p =>
    groupByCategoryWithMerge(p.goods.map(g => g.categoryId), mergeMap)
  );
  const collections = calculateCollections(mergedPlayerCats, mergedOtherPlayerCats, activeEvents);

  // --- Crediti residui (massimo 20 punti) ---
  let creditsMultiplier = 1;
  for (const event of activeEvents) {
    const effect = event.effect as EventEffect;
    if (effect.type === 'credits_multiplier') creditsMultiplier = effect.multiplier;
  }
  const creditsFrozen = activeEvents.some(e => (e.effect as any).type === 'credits_freeze');
  let residualCredits = creditsFrozen ? 0 : Math.min(Math.floor(player.credits * creditsMultiplier), 20);

  for (const event of activeEvents) {
    const effect = event.effect as EventEffect;
    if (effect.type === 'credits_penalty_above' && player.credits > effect.threshold) {
      residualCredits -= effect.penalty;
      eventModifiers -= effect.penalty;
    }
    if (effect.type === 'credits_bonus_below' && player.credits < effect.threshold) {
      residualCredits += effect.bonus;
      eventModifiers += effect.bonus;
    }
  }

  // --- Penalità Scugnizzu ---
  const scugnizzuPenalty = player.usedScugnizzu ? SCUGNIZZU_PENALTY : 0;

  // --- Obiettivi ---
  const objectives = completedObjectivesPoints;

  const total =
    goodsValue +
    baseCategoryBonus +
    collections.miniBonus +
    collections.fullBonus +
    collections.majorityBonus +
    objectives +
    residualCredits +
    scugnizzuPenalty;

  return {
    goodsValue,
    baseCategoryBonus,
    eventModifiers,
    miniCollections: collections.miniBonus,
    completeCollections: collections.fullBonus,
    majorityBonus: collections.majorityBonus,
    objectives,
    residualCredits,
    scugnizzuPenalty,
    total,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────────────────

function groupByCategory(categoryIds: number[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const id of categoryIds) {
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}

function groupByCategoryWithMerge(
  categoryIds: number[],
  mergeMap: Map<number, number>,
): Map<number, number> {
  const map = new Map<number, number>();
  for (const id of categoryIds) {
    const canonical = mergeMap.get(id) ?? id;
    map.set(canonical, (map.get(canonical) ?? 0) + 1);
  }
  return map;
}

function buildCategoryMergeMap(activeEvents: GameEvent[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const event of activeEvents) {
    const effect = event.effect as EventEffect;
    if (effect.type === 'category_merge' && Array.isArray((effect as any).categoryIds)) {
      const ids: number[] = (effect as any).categoryIds;
      const canonical = Math.min(...ids);
      for (const id of ids) map.set(id, canonical);
    }
  }
  return map;
}

/**
 * Calcola mini-collezioni, collezioni complete e bonus maggioranza.
 * @param playerCats    - categorie del giocatore corrente (dopo merge)
 * @param otherPlayerCats - categorie di TUTTI GLI ALTRI giocatori (giocatore corrente escluso)
 */
function calculateCollections(
  playerCats: Map<number, number>,
  otherPlayerCats: Map<number, number>[],
  activeEvents: GameEvent[],
): CollectionState {
  let miniBonus = MINI_COLLECTION_POINTS;
  let fullBonus = FULL_COLLECTION_POINTS;
  let majorityBonus = MAJORITY_POINTS;

  for (const event of activeEvents) {
    const e = event.effect as EventEffect;
    if (e.type === 'collection_bonus') {
      if (e.bonusType === 'mini') miniBonus += e.delta;
      if (e.bonusType === 'complete') fullBonus += e.delta;
      if (e.bonusType === 'majority') majorityBonus += e.delta;
    }
    if (e.type === 'collection_nullify') {
      if (e.bonusType === 'mini') miniBonus = 0;
      if (e.bonusType === 'complete') fullBonus = 0;
      if (e.bonusType === 'majority') majorityBonus = 0;
    }
  }

  let miniCount = 0, fullCount = 0;
  for (const [, count] of playerCats) {
    if (count >= 3) fullCount++;
    else if (count === 2) miniCount++;
  }

  // Maggioranza: il giocatore deve avere più categorie distinte di qualsiasi altro singolo giocatore
  const playerCategoryCount = playerCats.size;
  const maxOtherCount = otherPlayerCats.length > 0
    ? Math.max(...otherPlayerCats.map(m => m.size))
    : 0;
  const hasMajority = playerCategoryCount > 0 && playerCategoryCount > maxOtherCount;

  return {
    miniBonus: miniCount * miniBonus,
    fullBonus: fullCount * fullBonus,
    majorityBonus: hasMajority ? majorityBonus : 0,
    miniCount,
    fullCount,
  };
}
