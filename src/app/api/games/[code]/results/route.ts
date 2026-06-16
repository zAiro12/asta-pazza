import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players, playerGoods, goods, objectives, playerObjectives, events as eventsTable } from '@db/schema';
import { eq, inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { calculateScore } from '@/lib/scoring';
import type { PlayerWithGoods, Good, GameEvent } from '@/types/game';

type Ctx = { params: Promise<{ code: string }> };

/**
 * GET /api/games/[code]/results
 * Ritorna la classifica finale con punteggi dettagliati calcolati da scoring.ts.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const upperCode = code.toUpperCase();
  const db = drizzle(neon(process.env.DATABASE_URL!));

  const [game] = await db.select().from(games).where(eq(games.code, upperCode));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  const allPlayers = await db.select().from(players).where(eq(players.gameId, game.id));

  // Beni posseduti per ogni giocatore
  const allPlayerGoods = await db
    .select({ pg: playerGoods, good: goods })
    .from(playerGoods)
    .innerJoin(goods, eq(playerGoods.goodId, goods.id))
    .where(eq(playerGoods.gameId, game.id));

  // Obiettivi completati per ogni giocatore
  const allPlayerObjectives = await db
    .select({ po: playerObjectives, obj: objectives })
    .from(playerObjectives)
    .innerJoin(objectives, eq(playerObjectives.objectiveId, objectives.id))
    .where(eq(playerObjectives.gameId, game.id));

  // Eventi attivi (permanenti) della partita
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

  // Costruisce la struttura PlayerWithGoods per ogni giocatore
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

  const results = playersWithGoods.map(player => {
    const breakdown = calculateScore(player, playersWithGoods, activeEvents);

    const myObjectives = allPlayerObjectives.filter(r => r.po.playerId === player.id);
    const objectivesScore = myObjectives.reduce((sum, { obj }) => sum + obj.rewardPoints, 0);

    // Override obiettivi (scoring.ts ha TODO: 0 — usiamo quelli da DB)
    const total = breakdown.total + objectivesScore;

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
          pricePaid: pg.pricePaid,
          hasBaseBonus: player.baseCategoryId === good.categoryId,
        })),
      objectives: myObjectives.map(({ obj }) => ({
        id: obj.id,
        name: obj.name,
        points: obj.rewardPoints,
      })),
      score: {
        goods: breakdown.goodsValue,
        baseCategoryBonus: breakdown.baseCategoryBonus,
        eventModifiers: breakdown.eventModifiers,
        miniCollections: breakdown.miniCollections,
        completeCollections: breakdown.completeCollections,
        majorityBonus: breakdown.majorityBonus,
        objectives: objectivesScore,
        credits: breakdown.residualCredits,
        scugnizzuPenalty: breakdown.scugnizzuPenalty,
        total,
      },
    };
  });

  results.sort((a, b) => b.score.total - a.score.total);

  return NextResponse.json({ game: { code: upperCode, status: game.status }, results });
}
