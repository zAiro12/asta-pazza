import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players } from '@db/schema';
import { eq, and, ne } from 'drizzle-orm';
import { pusherServer } from '@/lib/pusher-server';

export async function POST(request: NextRequest) {
  const { playerId, gameCode } = await request.json();

  if (!playerId || !gameCode) {
    return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 });
  }

  const code = gameCode.toUpperCase();
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  // Recupera giocatore e partita
  const [player] = await db.select().from(players).where(eq(players.id, playerId));
  if (!player) return NextResponse.json({ error: 'Giocatore non trovato' }, { status: 404 });

  const [game] = await db.select().from(games).where(eq(games.code, code));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  // Rimuovi il giocatore
  await db.delete(players).where(eq(players.id, playerId));

  // Giocatori rimasti
  const remaining = await db
    .select()
    .from(players)
    .where(eq(players.gameId, game.id));

  if (remaining.length === 0) {
    // Nessun giocatore rimasto: cancella la partita
    await db.delete(games).where(eq(games.id, game.id));
    await pusherServer.trigger(`game-${code}`, 'game-deleted', {});
    return NextResponse.json({ ok: true, deleted: true });
  }

  // Se era l'host, trasferisci il ruolo al primo giocatore rimasto
  if (player.isHost) {
    const newHost = remaining[0];
    await db
      .update(players)
      .set({ isHost: true })
      .where(eq(players.id, newHost.id));
    remaining[0] = { ...newHost, isHost: true };
  }

  await pusherServer.trigger(`game-${code}`, 'player-left', {
    players: remaining,
  });

  return NextResponse.json({ ok: true, deleted: false });
}
