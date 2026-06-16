import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players, auctions } from '@db/schema';
import { eq, and } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { pusherServer } from '@/lib/pusher-server';

type Ctx = { params: Promise<{ code: string }> };

/**
 * POST /api/games/[code]/auction/close
 * Host chiude la fase revealing e prepara il turno successivo.
 * Se è l'ultimo turno, mette la partita in stato finished e fa broadcast game-finished.
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
    // Fine partita: aggiorna stato game e notifica tutti
    await db
      .update(games)
      .set({ status: 'finished', finishedAt: new Date() })
      .where(eq(games.id, game.id));

    await pusherServer.trigger(`game-${upperCode}`, 'game-finished', {
      gameId: game.id,
    });

    return NextResponse.json({ ok: true, finished: true });
  }

  // Turno non finale: notifica che l'asta è chiusa e si può procedere al prossimo
  await pusherServer.trigger(`game-${upperCode}`, 'auction-closed', {
    auctionId: auction.id,
    turn: auction.turn,
    totalTurns: game.totalTurns,
  });

  return NextResponse.json({ ok: true, finished: false });
}
