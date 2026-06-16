import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players, categories } from '@db/schema';
import { eq, inArray } from 'drizzle-orm';
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
// Quando status diventa 'active', assegna una categoria base casuale a ogni giocatore
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
    .set({ status: body.status, ...(body.selectedCategoryIds ? { selectedCategoryIds: body.selectedCategoryIds } : {}) })
    .where(eq(games.code, code.toUpperCase()))
    .returning();

  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  if (body.status === 'active') {
    // Assegna categoria base casuale a ogni giocatore (solo se non già assegnata)
    const allPlayers = await db.select().from(players).where(eq(players.gameId, game.id));
    const categoryIds = game.selectedCategoryIds as number[];

    if (categoryIds.length > 0) {
      const allCategories = await db
        .select()
        .from(categories)
        .where(inArray(categories.id, categoryIds));

      for (const player of allPlayers) {
        if (player.baseCategoryId !== null) continue; // già assegnata
        const randomCat = allCategories[Math.floor(Math.random() * allCategories.length)];
        await db
          .update(players)
          .set({ baseCategoryId: randomCat.id })
          .where(eq(players.id, player.id));
      }
    }

    // Ricarica giocatori aggiornati per il broadcast
    const updatedPlayers = await db.select().from(players).where(eq(players.gameId, game.id));
    await pusherServer.trigger(`game-${code.toUpperCase()}`, 'game-started', {
      gameId: game.id,
      players: updatedPlayers,
    });
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
