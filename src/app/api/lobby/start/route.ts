import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games } from '@db/schema';
import { eq } from 'drizzle-orm';
import { pusherServer } from '@/lib/pusher-server';

export async function POST(request: NextRequest) {
  const { code } = await request.json();

  if (!code) {
    return NextResponse.json({ error: 'Codice mancante' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const [game] = await db
    .update(games)
    .set({ status: 'active' })
    .where(eq(games.code, code.toUpperCase()))
    .returning();

  await pusherServer.trigger(`game-${code.toUpperCase()}`, 'game-started', {
    gameId: game.id,
  });

  return NextResponse.json({ ok: true });
}
