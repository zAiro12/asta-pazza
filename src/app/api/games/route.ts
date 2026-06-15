import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players } from '@db/schema';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// POST /api/games — crea una nuova partita
export async function POST(request: NextRequest) {
  const { hostName, categoryIds } = await request.json();

  if (!hostName) {
    return NextResponse.json({ error: 'Nome host obbligatorio' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  let code = generateCode();
  for (let i = 0; i < 10; i++) {
    const existing = await db.select().from(games).where(eq(games.code, code));
    if (existing.length === 0) break;
    code = generateCode();
  }

  const selectedCategoryIds = categoryIds ?? [];
  const totalTurns = selectedCategoryIds.length * 3;

  const [game] = await db
    .insert(games)
    .values({ code, status: 'lobby', selectedCategoryIds, totalTurns })
    .returning();

  const [host] = await db
    .insert(players)
    .values({ gameId: game.id, name: hostName, credits: 150, isHost: true })
    .returning();

  return NextResponse.json({ game, player: host }, { status: 201 });
}
