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
 * @param completedObjectivesPoints - Somma dei punti degli obiettivi completati dal giocatore (calcolata esternamente)
 */
export function calculateScore(
  player: PlayerWithGoods,
  allPlayers: PlayerWithGoods[],
  activeEvents: GameEvent[],
  completedObjectivesPoints = 0,
): ScoreBreakdown {
  const goodsPerCategory = groupByCategory(player.goods.map(g => g.categoryId));
  const allPlayersGoodsPerCategory = allPlayers.map(p => groupByCategory(p.goods.map(g => g.categoryId)));

  // Modifica valori beni per eventi
  let goodsValue = 0;
  let baseCategoryBonus = 0;
  let eventModifiers = 0;

  for (const good of player.goods) {
    let value = good.baseValue;

    // Applica eventi permanenti che modificano valore beni
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
    }

    goodsValue += value;

    // Bonus categoria base
    if (good.categoryId === player.baseCategoryId) {
      baseCategoryBonus += BASE_CATEGORY_BONUS;
    }
  }

  // Collezioni
  const collections = calculateCollections(goodsPerCategory, allPlayersGoodsPerCategory, activeEvents);

  // Crediti residui
  let creditsMultiplier = 1;
  for (const event of activeEvents) {
    const effect = event.effect as EventEffect;
    if (effect.type === 'credits_multiplier') creditsMultiplier = effect.multiplier;
  }
  // Check specifico Crisi di Fiducia
  const creditsFrozen = activeEvents.some(e => (e.effect as any).type === 'credits_freeze');
  const residualCredits = creditsFrozen ? 0 : Math.floor(player.credits * creditsMultiplier);

  // Penalità Scugnizzu
  const scugnizzuPenalty = player.usedScugnizzu ? SCUGNIZZU_PENALTY : 0;

  // Obiettivi: ricevuti come parametro già calcolato
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

function groupByCategory(categoryIds: number[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const id of categoryIds) {
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}

function calculateCollections(
  playerCats: Map<number, number>,
  allPlayerCats: Map<number, number>[],
  activeEvents: GameEvent[],
): CollectionState {
  let miniBonus = MINI_COLLECTION_POINTS;
  let fullBonus = FULL_COLLECTION_POINTS;
  let majorityBonus = MAJORITY_POINTS;

  // Modifica bonus per eventi
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

  // Maggioranza: il giocatore ha il maggior numero di categorie diverse
  const playerCategoryCount = playerCats.size;
  const maxOtherCount = Math.max(...allPlayerCats.map(m => m.size));
  const hasMajority = playerCategoryCount > 0 && playerCategoryCount >= maxOtherCount;

  return {
    miniBonus: miniCount * miniBonus,
    fullBonus: fullCount * fullBonus,
    majorityBonus: hasMajority ? majorityBonus : 0,
    miniCount,
    fullCount,
  };
}
