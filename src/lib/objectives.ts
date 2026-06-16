import type { PlayerWithGoods } from '@/types/game';

/**
 * Condizione di un obiettivo (campo `condition` dal DB).
 * Esempi:
 *  { type: 'min_goods', count: 3 }
 *  { type: 'min_goods_in_category', categoryId: 2, count: 2 }
 *  { type: 'min_categories', count: 3 }
 *  { type: 'all_goods_in_category', categoryId: 2 }
 *  { type: 'min_credits', amount: 50 }
 *  { type: 'no_goods_in_category', categoryId: 3 }
 *  { type: 'min_base_category_goods', count: 2 } // almeno N beni della propria categoria base
 *  { type: 'min_total_value', amount: 100 }
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
  | { type: 'always' }; // obiettivi senza condizione = sempre completati

export interface ObjectiveRow {
  id: number;
  name: string;
  type: string;
  description: string;
  rewardPoints: number;
  condition: ObjectiveCondition | null;
}

/**
 * Valuta se un giocatore ha completato un dato obiettivo.
 * `goodsInCategory` mappa categoryId -> numero di beni nel DB per quella categoria.
 */
export function evaluateObjective(
  player: PlayerWithGoods,
  objective: ObjectiveRow,
  goodsInCategory: Map<number, number>,
): boolean {
  const cond = objective.condition;
  if (!cond || cond.type === 'always') return true;

  const goodsByCategory = new Map<number, number>();
  for (const g of player.goods) {
    goodsByCategory.set(g.categoryId, (goodsByCategory.get(g.categoryId) ?? 0) + 1);
  }

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

    default:
      return false;
  }
}

/**
 * Ritorna gli id degli obiettivi completati da un giocatore.
 */
export function getCompletedObjectiveIds(
  player: PlayerWithGoods,
  allObjectives: ObjectiveRow[],
  goodsInCategory: Map<number, number>,
): number[] {
  return allObjectives
    .filter(obj => evaluateObjective(player, obj, goodsInCategory))
    .map(obj => obj.id);
}
