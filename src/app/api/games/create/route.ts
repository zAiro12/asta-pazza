import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games } from '@db/schema';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function POST(request: NextRequest) {
  const { hostName } = await request.json();

  if (!hostName) {
    return NextResponse.json({ error: 'Nome host obbligatorio' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  let code = generateCode();
  let attempts = 0;

  while (attempts < 10) {
    const existing = await db.select().from(games).where(
      (await import('drizzle-orm')).eq(games.code, code)
    );
    if (existing.length === 0) break;
    code = generateCode();
    attempts++;
  }

  const [game] = await db.insert(games)
    .values({ code, status: 'lobby', selectedCategoryIds: [], totalTurns: 0 })
    .returning();

  return NextResponse.json({ code: game.code, gameId: game.id });
}
