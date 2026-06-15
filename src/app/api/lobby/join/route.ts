import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players } from '@db/schema';
import { eq } from 'drizzle-orm';
import { pusherServer } from '@/lib/pusher-server';

export async function POST(request: NextRequest) {
  const { code, playerName } = await request.json();

  if (!code || !playerName) {
    return NextResponse.json({ error: 'Codice e nome sono obbligatori' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const [game] = await db.select().from(games).where(eq(games.code, code.toUpperCase()));
  if (!game) {
    return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });
  }
  if (game.status !== 'lobby') {
    return NextResponse.json({ error: 'La partita \u00e8 gi\u00e0 iniziata' }, { status: 400 });
  }

  const existingPlayers = await db.select().from(players).where(eq(players.gameId, game.id));
  const isHost = existingPlayers.length === 0;

  const [player] = await db.insert(players)
    .values({ gameId: game.id, name: playerName, isHost })
    .returning();

  const allPlayers = await db.select().from(players).where(eq(players.gameId, game.id));

  await pusherServer.trigger(`game-${code.toUpperCase()}`, 'player-joined', {
    players: allPlayers,
  });

  return NextResponse.json({ player, game });
}
