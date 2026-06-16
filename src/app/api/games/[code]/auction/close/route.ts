import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players, auctions, objectives, playerObjectives, playerGoods, goods } from '@db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { pusherServer } from '@/lib/pusher-server';
import { getCompletedObjectiveIds } from '@/lib/objectives';
import type { ObjectiveRow } from '@/lib/objectives';
import type { PlayerWithGoods, Good } from '@/types/game';

type Ctx = { params: Promise<{ code: string }> };

/**
 * POST /api/games/[code]/auction/close
 * Host chiude la fase revealing e prepara il turno successivo.
 * Se è l'ultimo turno: mette la partita in stato finished,
 * valuta automaticamente gli obiettivi e fa broadcast game-finished.
 * Body: { playerId: number }
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const upperCode = code.toUpperCase();
  const body = await request.json();
  const db = drizzle(neon(process.env.DATABASE_URL!));

  const [game] = await db.select().from(games).where(eq(games.code, upperCode));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  const [caller] = await db.select().from(players).where(eq(players.id, body.playerId));
  if (!caller || caller.gameId !== game.id || !caller.isHost)
    return NextResponse.json({ error: "Solo l'host può chiudere l'asta" }, { status: 403 });

  const [auction] = await db
    .select()
    .from(auctions)
    .where(and(eq(auctions.gameId, game.id), eq(auctions.status, 'revealing')))
    .limit(1);
  if (!auction) return NextResponse.json({ error: 'Nessuna asta in fase revealing' }, { status: 409 });

  // Chiudi l'asta corrente
  await db
    .update(auctions)
    .set({ status: 'finished', finishedAt: new Date() })
    .where(eq(auctions.id, auction.id));

  const isLastTurn = auction.turn >= game.totalTurns;

  if (isLastTurn) {
    // Fine partita
    await db
      .update(games)
      .set({ status: 'finished', finishedAt: new Date() })
      .where(eq(games.id, game.id));

    // Valuta obiettivi automaticamente
    await evaluateAndSaveObjectives(db, game.id, game.selectedCategoryIds as number[]);

    await pusherServer.trigger(`game-${upperCode}`, 'game-finished', {
      gameId: game.id,
    });

    return NextResponse.json({ ok: true, finished: true });
  }

  // Turno normale
  await pusherServer.trigger(`game-${upperCode}`, 'auction-closed', {
    auctionId: auction.id,
    turn: auction.turn,
    totalTurns: game.totalTurns,
  });

  return NextResponse.json({ ok: true, finished: false });
}

/** Valuta e salva in player_objectives tutti gli obiettivi completati. Idempotente. */
async function evaluateAndSaveObjectives(
  db: ReturnType<typeof drizzle>,
  gameId: number,
  categoryIds: number[],
) {
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
  const allObjectives: ObjectiveRow[] = rawObjectives.map(o => ({
    id: o.id,
    name: o.name,
    type: o.type,
    description: o.description,
    rewardPoints: o.points,
    condition: (o.condition as any) ?? null,
  }));

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

    const completedIds = getCompletedObjectiveIds(pwg, allObjectives, goodsInCategory);
    for (const objectiveId of completedIds) {
      const key = `${player.id}_${objectiveId}`;
      if (!existingKeys.has(key)) {
        toInsert.push({ playerId: player.id, gameId, objectiveId });
      }
    }
  }

  if (toInsert.length > 0) {
    await db.insert(playerObjectives).values(toInsert);
  }
}
