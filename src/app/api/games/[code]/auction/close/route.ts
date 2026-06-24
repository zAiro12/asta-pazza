import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players, auctions, objectives, playerObjectives, playerGoods, goods, playerObjectiveAssignments } from '@db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { pusherServer } from '@/lib/pusher-server';
import { getCompletedObjectiveIds } from '@/lib/objectives';
import type { ObjectiveRow } from '@/lib/objectives';
import type { PlayerWithGoods, Good } from '@/types/game';
import { validateSession } from '@/lib/session';

type Ctx = { params: Promise<{ code: string }> };

/**
 * POST /api/games/[code]/auction/close
 * Host chiude la fase revealing e prepara il turno successivo.
 * Valuta progressivamente gli obiettivi IMMEDIATI (non comparativi) ad ogni turno.
 * Gli obiettivi end-of-game (comparativi) vengono valutati solo in results/route.ts.
 * Se è l'ultimo turno: mette la partita in stato finished e fa broadcast game-finished.
 * Body: { playerId: number, sessionToken: string }
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const upperCode = code.toUpperCase();
  const body = await request.json();
  const db = drizzle(process.env.DATABASE_URL!);

  const [game] = await db.select().from(games).where(eq(games.code, upperCode));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  const caller = await validateSession(db, body.playerId, body.sessionToken, game.id);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!caller.isHost) return NextResponse.json({ error: "Solo l'host può chiudere l'asta" }, { status: 403 });

  const [auction] = await db
    .select()
    .from(auctions)
    .where(and(eq(auctions.gameId, game.id), eq(auctions.status, 'revealing')))
    .limit(1);
  if (!auction) return NextResponse.json({ error: 'Nessuna asta in fase revealing' }, { status: 409 });
  if (!auction.winnerId && Array.isArray(auction.tiedPlayerIds) && auction.tiedPlayerIds.length > 0) {
    return NextResponse.json({ error: 'Spareggio in corso' }, { status: 409 });
  }

  const [auctionGood] = await db.select().from(goods).where(eq(goods.id, auction.goodId));

  // Chiudi l'asta corrente
  await db
    .update(auctions)
    .set({ status: 'finished', finishedAt: new Date() })
    .where(eq(auctions.id, auction.id));

  // Valuta e salva gli obiettivi IMMEDIATI (non end-of-game)
  const newlyCompleted = await evaluateImmediateObjectives(db, game.id, game.selectedCategoryIds as number[]);

  const isLastTurn = auction.turn >= game.totalTurns;

  if (isLastTurn) {
    await db
      .update(games)
      .set({ status: 'finished', finishedAt: new Date() })
      .where(eq(games.id, game.id));

    await pusherServer.trigger(`game-${upperCode}`, 'game-finished', {
      gameId: game.id,
    });

    return NextResponse.json({ ok: true, finished: true });
  }

  // Carica lo stato aggiornato degli obiettivi + bonus immediati per il broadcast
  const allPlayers = await db.select().from(players).where(eq(players.gameId, game.id));
  const allCompletedObjectives = await db
    .select()
    .from(playerObjectives)
    .where(eq(playerObjectives.gameId, game.id));

  // Mappa playerId -> [objectiveId completati]
  const completedByPlayer: Record<number, number[]> = {};
  for (const row of allCompletedObjectives) {
    if (!completedByPlayer[row.playerId]) completedByPlayer[row.playerId] = [];
    completedByPlayer[row.playerId].push(row.objectiveId);
  }

  // Mappa playerId -> [objectiveId appena completati in questo turno]
  const newlyCompletedByPlayer: Record<number, number[]> = {};
  for (const { playerId, objectiveId } of newlyCompleted) {
    if (!newlyCompletedByPlayer[playerId]) newlyCompletedByPlayer[playerId] = [];
    newlyCompletedByPlayer[playerId].push(objectiveId);
  }

  // Calcola bonus immediati (mini-collection, complete-collection) per ogni giocatore
  const allPlayerGoods = await db
    .select({ pg: playerGoods, good: goods })
    .from(playerGoods)
    .innerJoin(goods, eq(playerGoods.goodId, goods.id))
    .where(eq(playerGoods.gameId, game.id));

  const immediateBonusByPlayer: Record<number, { miniCollections: number; completeCollections: number }> = {};
  for (const player of allPlayers) {
    const myGoods = allPlayerGoods.filter(r => r.pg.playerId === player.id);
    const goodsByCategory = new Map<number, number>();
    for (const { good } of myGoods) {
      goodsByCategory.set(good.categoryId, (goodsByCategory.get(good.categoryId) ?? 0) + 1);
    }
    let mini = 0, complete = 0;
    for (const [, cnt] of goodsByCategory) {
      if (cnt >= 3) complete++;
      else if (cnt === 2) mini++;
    }
    immediateBonusByPlayer[player.id] = { miniCollections: mini, completeCollections: complete };
  }

  await pusherServer.trigger(`game-${upperCode}`, 'auction-closed', {
    auctionId: auction.id,
    turn: auction.turn,
    totalTurns: game.totalTurns,
    goodId: auction.goodId,
    goodName: auctionGood?.name ?? '',
    winnerId: auction.winnerId ?? null,
    winningBid: auction.winningBid ?? 0,
    completedObjectivesByPlayer: completedByPlayer,
    newlyCompletedObjectivesByPlayer: newlyCompletedByPlayer,
    immediateBonusByPlayer,
  });

  return NextResponse.json({ ok: true, finished: false });
}

/**
 * Valuta e salva in player_objectives tutti gli obiettivi IMMEDIATI (non end-of-game) completati.
 * Considera solo gli obiettivi assegnati al giocatore in questa partita.
 * Idempotente. Ritorna i record appena inseriti.
 */
async function evaluateImmediateObjectives(
  db: ReturnType<typeof drizzle>,
  gameId: number,
  categoryIds: number[],
): Promise<{ playerId: number; objectiveId: number }[]> {
  const allPlayers = await db.select().from(players).where(eq(players.gameId, gameId));

  const allPlayerGoods = await db
    .select({ pg: playerGoods, good: goods })
    .from(playerGoods)
    .innerJoin(goods, eq(playerGoods.goodId, goods.id))
    .where(eq(playerGoods.gameId, gameId));

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

  // Obiettivi già salvati come completati (per idempotenza)
  const existing = await db
    .select()
    .from(playerObjectives)
    .where(eq(playerObjectives.gameId, gameId));
  const existingKeys = new Set(existing.map(e => `${e.playerId}_${e.objectiveId}`));

  const toInsert: { playerId: number; gameId: number; objectiveId: number }[] = [];

  for (const player of allPlayers) {
    const myGoods: Good[] = allPlayerGoods
      .filter(r => r.pg.playerId === player.id)
      .map(({ good }) => ({
        id: good.id,
        name: good.name,
        categoryId: good.categoryId,
        categoryName: '',
        baseValue: good.baseValue,
      }));

    const pwg: PlayerWithGoods = {
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

    // Solo obiettivi IMMEDIATI (esclude end-of-game)
    const completedIds = getCompletedObjectiveIds(
      pwg,
      assignedObjectives,
      goodsInCategory,
      undefined,
      { onlyImmediate: true },
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

  return toInsert.map(({ playerId, objectiveId }) => ({ playerId, objectiveId }));
}
