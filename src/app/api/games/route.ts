import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players } from '@db/schema';
import { generateRoomCode } from '@/lib/auction';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { playerName, categoryIds } = await request.json();

  if (!playerName || !categoryIds?.length) {
    return NextResponse.json({ error: 'Parametri mancanti' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const code = generateRoomCode();
  const totalTurns = categoryIds.length * 3; // 3 beni per categoria

  const [game] = await db.insert(games).values({
    code,
    status: 'lobby',
    selectedCategoryIds: categoryIds,
    totalTurns,
  }).returning();

  const [host] = await db.insert(players).values({
    gameId: game.id,
    name: playerName,
    credits: 150,
    isHost: true,
  }).returning();

  return NextResponse.json({ game, player: host });
}
