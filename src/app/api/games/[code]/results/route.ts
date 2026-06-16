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
 * Gli obiettivi completati vengono letti da player_objectives e passati a calculateScore.
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

  // Obiettivi completati per ogni giocatore (già scritti da evaluate-objectives)
  const allPlayerObjectives = await db
    .select({ po: playerObjectives, obj: objectives })
    .from(playerObjectives)
    .innerJoin(objectives, eq(playerObjectives.objectiveId, objectives.id))
    .where(eq(playerObjectives.gameId, game.id));

  // Mappa playerId -> punti totali obiettivi
  const objectivePointsByPlayer = new Map<number, number>();
  for (const { po, obj } of allPlayerObjectives) {
    objectivePointsByPlayer.set(
      po.playerId,
      (objectivePointsByPlayer.get(po.playerId) ?? 0) + obj.points,
    );
  }

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
    // Punti obiettivi completati per questo giocatore
    const objectivesPoints = objectivePointsByPlayer.get(player.id) ?? 0;

    // calculateScore ora riceve i punti obiettivi e li integra nel total
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
