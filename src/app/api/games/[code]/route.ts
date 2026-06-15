import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players } from '@db/schema';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { pusherServer } from '@/lib/pusher-server';

type Ctx = { params: Promise<{ code: string }> };

// GET /api/games/[code] — stato partita + giocatori
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const [game] = await db.select().from(games).where(eq(games.code, code.toUpperCase()));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  const allPlayers = await db.select().from(players).where(eq(players.gameId, game.id));
  return NextResponse.json({ game, players: allPlayers });
}

// PUT /api/games/[code] — aggiorna stato partita (es. avvia)
export async function PUT(request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const body = await request.json();

  if (!body.status) {
    return NextResponse.json({ error: 'Campo status obbligatorio' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const [game] = await db
    .update(games)
    .set({ status: body.status, ...( body.selectedCategoryIds ? { selectedCategoryIds: body.selectedCategoryIds } : {} ) })
    .where(eq(games.code, code.toUpperCase()))
    .returning();

  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  if (body.status === 'active') {
    await pusherServer.trigger(`game-${code.toUpperCase()}`, 'game-started', { gameId: game.id });
  }

  return NextResponse.json({ game });
}

// DELETE /api/games/[code] — cancella partita
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const [game] = await db.select().from(games).where(eq(games.code, code.toUpperCase()));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  await db.delete(players).where(eq(players.gameId, game.id));
  await db.delete(games).where(eq(games.id, game.id));
  await pusherServer.trigger(`game-${code.toUpperCase()}`, 'game-deleted', {});

  return new NextResponse(null, { status: 204 });
}
