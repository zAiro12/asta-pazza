import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players, auctions, bids, tiebreakBids, playerGoods, goods } from '@db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { pusherServer } from '@/lib/pusher-server';
import { validateSession } from '@/lib/session';
import type { Bid } from '@/types/game';

type Ctx = { params: Promise<{ code: string }> };

/**
 * POST /api/games/[code]/auction/tiebreak
 * Body: { playerId: number, sessionToken: string, amount: number }
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  let body: { playerId: number; sessionToken?: string; amount: number };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }); }

  const { playerId, sessionToken, amount } = body;
  if (!playerId || amount === undefined || amount < 0 || !Number.isInteger(amount)) {
    return NextResponse.json({ error: 'playerId e amount intero >= 0 obbligatori' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const [game] = await db.select().from(games).where(eq(games.code, upperCode));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });
  if (game.status !== 'active') return NextResponse.json({ error: 'Partita non attiva' }, { status: 409 });

  const player = await validateSession(db, playerId, sessionToken, game.id);
  if (!player) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [auction] = await db
    .select()
    .from(auctions)
    .where(and(eq(auctions.gameId, game.id), eq(auctions.status, 'revealing')))
    .limit(1);
  if (!auction) return NextResponse.json({ error: 'Nessuna asta in fase revealing' }, { status: 409 });
  if (auction.winnerId) return NextResponse.json({ error: 'Asta già risolta' }, { status: 409 });

  const tiedPlayerIds = ((auction.tiedPlayerIds as number[]) ?? []);
  if (tiedPlayerIds.length < 2) return NextResponse.json({ error: 'Nessuno spareggio in corso' }, { status: 409 });
  if (!tiedPlayerIds.includes(playerId)) return NextResponse.json({ error: 'Giocatore non coinvolto nello spareggio' }, { status: 403 });
  if (amount > player.credits) return NextResponse.json({ error: 'Crediti insufficienti' }, { status: 409 });

  const currentRound = auction.tiebreakRound > 0 ? auction.tiebreakRound : 1;

  const [existing] = await db
    .select()
    .from(tiebreakBids)
    .where(and(eq(tiebreakBids.auctionId, auction.id), eq(tiebreakBids.playerId, playerId), eq(tiebreakBids.round, currentRound)))
    .limit(1);

  if (existing) {
    await db.update(tiebreakBids).set({ amount }).where(eq(tiebreakBids.id, existing.id));
  } else {
    await db.insert(tiebreakBids).values({ auctionId: auction.id, playerId, amount, round: currentRound });
  }

  const roundBids = await db
    .select()
    .from(tiebreakBids)
    .where(and(eq(tiebreakBids.auctionId, auction.id), eq(tiebreakBids.round, currentRound), inArray(tiebreakBids.playerId, tiedPlayerIds)));

  if (roundBids.length < tiedPlayerIds.length) {
    return NextResponse.json({ ok: true, waitingForOthers: true });
  }

  const [auctionGood] = await db.select().from(goods).where(eq(goods.id, auction.goodId));
  const rawBids = await db
    .select({ bid: bids, player: players })
    .from(bids)
    .innerJoin(players, eq(bids.playerId, players.id))
    .where(eq(bids.auctionId, auction.id));

  const typedBids: Bid[] = rawBids.map(({ bid, player: p }) => ({
    playerId: bid.playerId,
    playerName: p.name,
    amount: bid.amount,
    isMercatoNero: bid.isMercatoNero,
  }));

  // Recupera i nomi dei giocatori per costruire le roundBids tipizzate
  const allPlayers = await db.select().from(players).where(eq(players.gameId, game.id));
  const playerNameMap = new Map<number, string>(allPlayers.map(p => [p.id, p.name]));

  const typedRoundBids = roundBids.map(b => ({
    playerId: b.playerId,
    playerName: playerNameMap.get(b.playerId) ?? `#${b.playerId}`,
    amount: b.amount,
    round: b.round,
  }));

  const originalByPlayer = new Map<number, number>(typedBids.map(b => [b.playerId, b.amount]));
  const topTiebreak = Math.max(...roundBids.map(b => b.amount));
  const topBidders = roundBids.filter(b => b.amount === topTiebreak);

  if (topBidders.length > 1) {
    const nextTied = topBidders.map(b => b.playerId);

    await db
      .update(auctions)
      .set({
        winnerId: undefined,
        winningBid: topTiebreak,
        tiedPlayerIds: nextTied,
        tiebreakRound: currentRound + 1,
      })
      .where(eq(auctions.id, auction.id));

    const updatedPlayers = await db.select().from(players).where(eq(players.gameId, game.id));
    const details = `Pareggio nello spareggio a ${topTiebreak} — nuovo spareggio`;

    await pusherServer.trigger(`game-${upperCode}`, 'tiebreak-resolved', {
      auctionId: auction.id,
      goodId: auction.goodId,
      goodName: auctionGood?.name ?? '',
      turn: auction.turn,
      bids: typedBids,
      roundBids: typedRoundBids,
      tiebreakRound: currentRound,
      winnerId: null,
      winningBid: topTiebreak,
      details,
      tiedPlayerIds: nextTied,
      players: updatedPlayers,
    });

    return NextResponse.json({ winnerId: null, winningBid: topTiebreak, details, tiedPlayerIds: nextTied, bids: typedBids, roundBids: typedRoundBids });
  }

  const winnerId = topBidders[0].playerId;
  const winnerTiebreakBid = topBidders[0].amount;
  const winnerOriginalBid = originalByPlayer.get(winnerId) ?? 0;
  const finalPrice = Math.max(winnerOriginalBid, winnerTiebreakBid);

  await db
    .update(auctions)
    .set({
      winnerId,
      winningBid: finalPrice,
      tiedPlayerIds: [],
      tiebreakRound: currentRound,
    })
    .where(eq(auctions.id, auction.id));

  await db.insert(playerGoods).values({
    playerId: winnerId,
    gameId: game.id,
    goodId: auction.goodId,
    pricePaid: finalPrice,
    wonAtTurn: auction.turn,
  });

  await sql`UPDATE players SET credits = credits - ${finalPrice} WHERE id = ${winnerId}`;

  const updatedPlayers = await db.select().from(players).where(eq(players.gameId, game.id));
  const winnerName = updatedPlayers.find(p => p.id === winnerId)?.name ?? 'Giocatore';
  const details = `${winnerName} vince lo spareggio pagando ${finalPrice} crediti`;

  await pusherServer.trigger(`game-${upperCode}`, 'tiebreak-resolved', {
    auctionId: auction.id,
    goodId: auction.goodId,
    goodName: auctionGood?.name ?? '',
    turn: auction.turn,
    bids: typedBids,
    roundBids: typedRoundBids,
    tiebreakRound: currentRound,
    winnerId,
    winningBid: finalPrice,
    details,
    tiedPlayerIds: [],
    players: updatedPlayers,
  });

  return NextResponse.json({ winnerId, winningBid: finalPrice, details, tiedPlayerIds: [], bids: typedBids, roundBids: typedRoundBids });
}
