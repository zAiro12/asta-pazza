import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players, auctions, bids, goods, playerGoods } from '@db/schema';
import { eq, inArray, and } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { pusherServer } from '@/lib/pusher-server';
import { resolveAuction, isEventTurn, AUCTION_TIMER_SECONDS } from '@/lib/auction';
import type { Bid } from '@/types/game';

type Ctx = { params: Promise<{ code: string }> };

function getDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql);
}

/**
 * GET /api/games/[code]/auction
 * Restituisce lo stato dell'asta corrente (bene, turno, offerte se rivelate).
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const db = getDb();

  const [game] = await db.select().from(games).where(eq(games.code, code.toUpperCase()));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });
  if (game.status !== 'active') return NextResponse.json({ error: 'Partita non attiva' }, { status: 409 });

  const [auction] = await db
    .select()
    .from(auctions)
    .where(and(eq(auctions.gameId, game.id), inArray(auctions.status, ['bidding', 'revealing'])))
    .limit(1);

  if (!auction) return NextResponse.json({ auction: null, game });

  const good = await db.select().from(goods).where(eq(goods.id, auction.goodId)).then(r => r[0]);

  // Mostra le offerte solo se siamo in fase revealing
  let auctionBids = null;
  if (auction.status === 'revealing') {
    auctionBids = await db.select().from(bids).where(eq(bids.auctionId, auction.id));
  }

  return NextResponse.json({ auction: { ...auction, good }, bids: auctionBids, game });
}

/**
 * POST /api/games/[code]/auction
 * Host avvia la prossima asta (o la prima).
 * Body: { playerId: number }
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const upperCode = code.toUpperCase();
  const body = await request.json();
  const db = getDb();

  const [game] = await db.select().from(games).where(eq(games.code, upperCode));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });
  if (game.status !== 'active') return NextResponse.json({ error: 'Partita non attiva' }, { status: 409 });

  const [caller] = await db.select().from(players).where(eq(players.id, body.playerId));
  if (!caller || caller.gameId !== game.id || !caller.isHost)
    return NextResponse.json({ error: 'Solo l\'host può avviare le aste' }, { status: 403 });

  // Controlla che non ci sia già un'asta attiva
  const [active] = await db
    .select()
    .from(auctions)
    .where(and(eq(auctions.gameId, game.id), inArray(auctions.status, ['bidding', 'revealing'])))
    .limit(1);
  if (active) return NextResponse.json({ error: 'C\'è già un\'asta in corso' }, { status: 409 });

  const nextTurn = game.currentTurn + 1;
  if (nextTurn > game.totalTurns) {
    // Fine partita
    await db.update(games).set({ status: 'finished', finishedAt: new Date() }).where(eq(games.id, game.id));
    await pusherServer.trigger(`game-${upperCode}`, 'game-finished', { gameId: game.id });
    return NextResponse.json({ finished: true });
  }

  // Prendi il bene da mettere all'asta (in ordine per categoria selezionata)
  const categoryIds = (game.selectedCategoryIds as number[]);
  const allGoods = await db
    .select()
    .from(goods)
    .where(inArray(goods.categoryId, categoryIds));

  // Escludi i beni già venduti
  const soldGoods = await db
    .select({ goodId: playerGoods.goodId })
    .from(playerGoods)
    .where(eq(playerGoods.gameId, game.id));
  const soldIds = soldGoods.map(s => s.goodId);

  // Beni già in asta (finished)
  const auctionedGoods = await db
    .select({ goodId: auctions.goodId })
    .from(auctions)
    .where(eq(auctions.gameId, game.id));
  const auctionedIds = auctionedGoods.map(a => a.goodId);

  const usedIds = new Set([...soldIds, ...auctionedIds]);
  const availableGoods = allGoods.filter(g => !usedIds.has(g.id));

  if (availableGoods.length === 0) {
    await db.update(games).set({ status: 'finished', finishedAt: new Date() }).where(eq(games.id, game.id));
    await pusherServer.trigger(`game-${upperCode}`, 'game-finished', { gameId: game.id });
    return NextResponse.json({ finished: true });
  }

  // Ordine casuale tra i disponibili
  const goodToAuction = availableGoods[Math.floor(Math.random() * availableGoods.length)];

  // Crea l'asta
  const [newAuction] = await db
    .insert(auctions)
    .values({
      gameId: game.id,
      goodId: goodToAuction.id,
      turn: nextTurn,
      status: 'bidding',
      startedAt: new Date(),
    })
    .returning();

  // Aggiorna il turno corrente
  await db.update(games).set({ currentTurn: nextTurn }).where(eq(games.id, game.id));

  const isEvent = isEventTurn(nextTurn, game.totalTurns);

  await pusherServer.trigger(`game-${upperCode}`, 'auction-started', {
    auction: { ...newAuction, good: goodToAuction },
    turn: nextTurn,
    totalTurns: game.totalTurns,
    isEventTurn: isEvent,
    timerSeconds: AUCTION_TIMER_SECONDS,
  });

  return NextResponse.json({
    auction: { ...newAuction, good: goodToAuction },
    turn: nextTurn,
    totalTurns: game.totalTurns,
    isEventTurn: isEvent,
  });
}
