import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { players } from '@db/schema';
import { eq } from 'drizzle-orm';
import { pusherServer } from '@/lib/pusher-server';

export async function POST(request: NextRequest) {
  const { playerId, gameCode } = await request.json();

  if (!playerId || !gameCode) {
    return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  await db.delete(players).where(eq(players.id, playerId));

  const remaining = await db.select().from(players).where(eq(players.gameId, playerId));

  await pusherServer.trigger(`game-${gameCode.toUpperCase()}`, 'player-left', {
    players: remaining,
  });

  return NextResponse.json({ ok: true });
}
