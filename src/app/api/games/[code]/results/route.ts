import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players, playerGoods, goods, categories, objectives, playerObjectives, events as eventsTable, playerObjectiveAssignments } from '@db/schema';
import { eq, inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { calculateScore } from '@/lib/scoring';
import { getCompletedObjectiveIds } from '@/lib/objectives';
import type { ObjectiveRow } from '@/lib/objectives';
import type { PlayerWithGoods, Good, GameEvent } from '@/types/game';

type Ctx = { params: Promise<{ code: string }> };

/**
 * GET /api/games/[code]/results
 * Prima di restituire i risultati, valuta e salva gli obiettivi END-OF-GAME
 * (comparativi tra giocatori) che non erano stati valutati durante la partita.
 * Poi ritorna la classifica finale con punteggi dettagliati.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const upperCode = code.toUpperCase();
  const db = drizzle(neon(process.env.DATABASE_URL!));

  const [game] = await db.select().from(games).where(eq(games.code, upperCode));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  const allPlayers = await db.select().from(players).where(eq(players.gameId, game.id));

  const allPlayerGoods = await db
    .select({ pg: playerGoods, good: goods })
    .from(playerGoods)
    .innerJoin(goods, eq(playerGoods.goodId, goods.id))
    .where(eq(playerGoods.gameId, game.id));

  // Carica mappa categoryId -> categoryName
  const selectedCategoryIds = (game.selectedCategoryIds ?? []) as number[];
  let categoriesMap: Record<number, string> = {};
  if (selectedCategoryIds.length > 0) {
    const cats = await db.select().from(categories).where(inArray(categories.id, selectedCategoryIds));
    for (const c of cats) {
      categoriesMap[c.id] = c.name;
    }
  }

  // Costruisce PlayerWithGoods per ogni giocatore
  const playersWithGoods: PlayerWithGoods[] = allPlayers.map(player => {
    const myGoods: Good[] = allPlayerGoods
      .filter(r => r.pg.playerId === player.id)
      .map(({ good }) => ({
        id: good.id,
        name: good.name,
        categoryId: good.categoryId,
        categoryName: (good as any).categoryName ?? '',
        baseValue: good.baseValue,
      }));
    return {
      id: player.id,
      gameId: player.gameId,
      name: player.name,
      credits: player.credits,
      baseCategoryId: player.baseCategoryId,
      usedScugnizzu: player.usedScugnizzu ?? false,
      usedMercatoNero: player.usedMercatoNero ?? false,
      isHost: player.isHost,
      goods: myGoods,
    };
  });

  // ── Valuta e salva gli obiettivi END-OF-GAME ────────────────────────────────
  await evaluateEndOfGameObjectives(db, game.id, selectedCategoryIds, playersWithGoods);

  // ── Legge tutti gli obiettivi completati (immediati + end-of-game) ──────────
  const allPlayerObjectives = await db
    .select({ po: playerObjectives, obj: objectives })
    .from(playerObjectives)
    .innerJoin(objectives, eq(playerObjectives.objectiveId, objectives.id))
    .where(eq(playerObjectives.gameId, game.id));

  const objectivePointsByPlayer = new Map<number, number>();
  for (const { po, obj } of allPlayerObjectives) {
    objectivePointsByPlayer.set(
      po.playerId,
      (objectivePointsByPlayer.get(po.playerId) ?? 0) + obj.points,
    );
  }

  // ── Eventi attivi ───────────────────────────────────────────────────────────
  const activeEventIds = (game.activeEventIds ?? []) as number[];
  let activeEvents: GameEvent[] = [];
  if (activeEventIds.length > 0) {
    const rawEvents = await db
      .select()
      .from(eventsTable)
      .where(inArray(eventsTable.id, activeEventIds));
    activeEvents = rawEvents.map(e => ({
      id: e.id,
      name: e.name,
      type: e.type as GameEvent['type'],
      effect: e.effect as GameEvent['effect'],
      description: e.description ?? '',
    }));
  }

  // ── Calcola punteggi e classifica ──────────────────────────────────────────
  const results = playersWithGoods.map(player => {
    const objectivesPoints = objectivePointsByPlayer.get(player.id) ?? 0;
    const breakdown = calculateScore(player, playersWithGoods, activeEvents, objectivesPoints);

    return {
      player: {
        id: player.id,
        name: player.name,
        credits: player.credits,
        usedScugnizzu: player.usedScugnizzu,
      },
      goods: allPlayerGoods
        .filter(r => r.pg.playerId === player.id)
        .map(({ pg, good }) => ({
          id: good.id,
          name: good.name,
          baseValue: good.baseValue,
          categoryId: good.categoryId,
          categoryName: categoriesMap[good.categoryId] ?? '',
          pricePaid: pg.pricePaid,
          hasBaseBonus: player.baseCategoryId === good.categoryId,
        })),
      objectives: allPlayerObjectives
        .filter(r => r.po.playerId === player.id)
        .map(({ obj }) => ({
          id: obj.id,
          name: obj.name,
          points: obj.points,
        })),
      score: {
        goods: breakdown.goodsValue,
        baseCategoryBonus: breakdown.baseCategoryBonus,
        eventModifiers: breakdown.eventModifiers,
        miniCollections: breakdown.miniCollections,
        completeCollections: breakdown.completeCollections,
        majorityBonus: breakdown.majorityBonus,
        objectives: breakdown.objectives,
        credits: breakdown.residualCredits,
        scugnizzuPenalty: breakdown.scugnizzuPenalty,
        total: breakdown.total,
      },
    };
  });

  results.sort((a, b) => b.score.total - a.score.total);

  return NextResponse.json({ game: { code: upperCode, status: game.status }, results });
}

/**
 * Valuta e salva in player_objectives solo gli obiettivi END-OF-GAME
 * (quelli comparativi che richiedono allPlayers).
 * Idempotente — non sovrascrive completamenti già esistenti.
 */
async function evaluateEndOfGameObjectives(
  db: ReturnType<typeof drizzle>,
  gameId: number,
  categoryIds: number[],
  playersWithGoods: PlayerWithGoods[],
): Promise<void> {
  const allGoods = categoryIds.length > 0
    ? await db.select().from(goods).where(inArray(goods.categoryId, categoryIds))
    : [];

  const goodsInCategory = new Map<number, number>();
  for (const g of allGoods) {
    goodsInCategory.set(g.categoryId, (goodsInCategory.get(g.categoryId) ?? 0) + 1);
  }

  const rawObjectives = await db.select().from(objectives);
  const allObjectivesMap = new Map(rawObjectives.map(o => [o.id, o]));

  const allAssignments = await db
    .select()
    .from(playerObjectiveAssignments)
    .where(eq(playerObjectiveAssignments.gameId, gameId));

  const existing = await db
    .select()
    .from(playerObjectives)
    .where(eq(playerObjectives.gameId, gameId));
  const existingKeys = new Set(existing.map(e => `${e.playerId}_${e.objectiveId}`));

  const toInsert: { playerId: number; gameId: number; objectiveId: number }[] = [];

  for (const player of playersWithGoods) {
    const assignedObjectiveIds = allAssignments
      .filter(a => a.playerId === player.id)
      .map(a => a.objectiveId);

    const assignedObjectives: ObjectiveRow[] = assignedObjectiveIds
      .map(id => {
        const o = allObjectivesMap.get(id);
        if (!o) return null;
        return {
          id: o.id,
          name: o.name,
          type: o.type,
          description: o.description,
          rewardPoints: o.points,
          condition: (o.condition as any) ?? null,
        };
      })
      .filter(Boolean) as ObjectiveRow[];

    // Solo obiettivi END-OF-GAME, con allPlayers per i comparativi
    const completedIds = getCompletedObjectiveIds(
      player,
      assignedObjectives,
      goodsInCategory,
      playersWithGoods,
      { onlyEndOfGame: true },
    );

    for (const objectiveId of completedIds) {
      const key = `${player.id}_${objectiveId}`;
      if (!existingKeys.has(key)) {
        toInsert.push({ playerId: player.id, gameId, objectiveId });
        existingKeys.add(key);
      }
    }
  }

  if (toInsert.length > 0) {
    await db.insert(playerObjectives).values(toInsert);
  }
}
