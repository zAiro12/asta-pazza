import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players } from '@db/schema';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { pusherServer } from '@/lib/pusher-server';

type Ctx = { params: Promise<{ code: string; id: string }> };

// DELETE /api/games/[code]/players/[id] — esci dalla partita
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { code, id } = await params;
  const playerId = parseInt(id);

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle({ client: sql });

  const [player] = await db.select().from(players).where(eq(players.id, playerId));
  if (!player) return NextResponse.json({ error: 'Giocatore non trovato' }, { status: 404 });

  const [game] = await db.select().from(games).where(eq(games.code, code.toUpperCase()));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  await db.delete(players).where(eq(players.id, playerId));

  const remaining = await db.select().from(players).where(eq(players.gameId, game.id));

  if (remaining.length === 0) {
    await db.delete(games).where(eq(games.id, game.id));
    await pusherServer.trigger(`game-${code.toUpperCase()}`, 'game-deleted', {});
    return new NextResponse(null, { status: 204 });
  }

  if (player.isHost) {
    const newHost = remaining[0];
    await db.update(players).set({ isHost: true }).where(eq(players.id, newHost.id));
    remaining[0] = { ...newHost, isHost: true };
  }

  await pusherServer.trigger(`game-${code.toUpperCase()}`, 'player-left', { players: remaining });

  return new NextResponse(null, { status: 204 });
}
