import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players, auctions, bids, playerGoods } from '@db/schema';
import { eq, and } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { pusherServer } from '@/lib/pusher-server';
import { resolveAuction } from '@/lib/auction';
import type { Bid } from '@/types/game';

type Ctx = { params: Promise<{ code: string }> };

/**
 * POST /api/games/[code]/auction/reveal
 * Host rivela le offerte, assegna il bene al vincitore e scala i crediti.
 * Body: { playerId: number }
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const upperCode = code.toUpperCase();
  const body = await request.json();
  const sqlClient = neon(process.env.DATABASE_URL!);
  const db = drizzle(sqlClient);

  const [game] = await db.select().from(games).where(eq(games.code, upperCode));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  const [caller] = await db.select().from(players).where(eq(players.id, body.playerId));
  if (!caller || caller.gameId !== game.id || !caller.isHost)
    return NextResponse.json({ error: "Solo l'host può rivelare le offerte" }, { status: 403 });

  const [auction] = await db
    .select()
    .from(auctions)
    .where(and(eq(auctions.gameId, game.id), eq(auctions.status, 'bidding')))
    .limit(1);
  if (!auction) return NextResponse.json({ error: 'Nessuna asta da rivelare' }, { status: 409 });

  // Carica tutte le offerte con i nomi dei giocatori
  const rawBids = await db
    .select({ bid: bids, player: players })
    .from(bids)
    .innerJoin(players, eq(bids.playerId, players.id))
    .where(eq(bids.auctionId, auction.id));

  const typedBids: Bid[] = rawBids.map(({ bid, player }) => ({
    playerId: bid.playerId,
    playerName: player.name,
    amount: bid.amount,
    isMercatoNero: bid.isMercatoNero,
  }));

  const allPlayers = await db.select().from(players).where(eq(players.gameId, game.id));
  const result = resolveAuction(typedBids, allPlayers as never);

  // Aggiorna asta
  await db
    .update(auctions)
    .set({
      status: 'revealing',
      winnerId: result.winnerId ?? undefined,
      winningBid: result.winningBid,
    })
    .where(eq(auctions.id, auction.id));

  // Assegna bene e scala crediti al vincitore
  if (result.winnerId) {
    await db.insert(playerGoods).values({
      playerId: result.winnerId,
      gameId: game.id,
      goodId: auction.goodId,
      pricePaid: result.winningBid,
      wonAtTurn: auction.turn,
    });

    // Scala crediti con SQL raw per evitare race condition
    await sqlClient`
      UPDATE players SET credits = credits - ${result.winningBid} WHERE id = ${result.winnerId}
    `;

    // Se ha usato Mercato Nero, marca il flag
    const mnBid = typedBids.find(b => b.isMercatoNero && b.playerId === result.winnerId);
    if (mnBid) {
      await db.update(players).set({ usedMercatoNero: true }).where(eq(players.id, result.winnerId));
    }
  }

  // Carica dati aggiornati per il broadcast
  const updatedPlayers = await db.select().from(players).where(eq(players.gameId, game.id));

  await pusherServer.trigger(`game-${upperCode}`, 'bids-revealed', {
    auctionId: auction.id,
    goodId: auction.goodId,
    turn: auction.turn,
    bids: typedBids,
    winnerId: result.winnerId,
    winningBid: result.winningBid,
    details: result.details,
    players: updatedPlayers,
  });

  return NextResponse.json({
    winnerId: result.winnerId,
    winningBid: result.winningBid,
    details: result.details,
    bids: typedBids,
  });
}
