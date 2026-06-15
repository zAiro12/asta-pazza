import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players } from '@db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')?.toUpperCase();

  if (!code) {
    return NextResponse.json({ error: 'Codice mancante' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const [game] = await db.select().from(games).where(eq(games.code, code));
  if (!game) {
    return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });
  }

  const allPlayers = await db.select().from(players).where(eq(players.gameId, game.id));

  return NextResponse.json({ game, players: allPlayers });
}
