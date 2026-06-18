import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players, categories, goods } from '@db/schema';
import { eq, inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { pusherServer } from '@/lib/pusher-server';
import { validateSession } from '@/lib/session';

type Ctx = { params: Promise<{ code: string }> };

/**
 * POST /api/games/[code]/categories
 * Solo l'host può selezionare le categorie mentre la partita è in stato "lobby".
 * Body: { playerId: number, sessionToken: string, selectedCategoryIds: number[] }
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  let body: { playerId: number; sessionToken?: string; selectedCategoryIds: number[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON non valido' }, { status: 400 });
  }

  const { playerId, sessionToken, selectedCategoryIds } = body;

  // Validazione input
  if (!playerId || !Array.isArray(selectedCategoryIds) || selectedCategoryIds.length === 0) {
    return NextResponse.json(
      { error: 'playerId e almeno una categoria sono obbligatori' },
      { status: 400 }
    );
  }

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  // Carica partita
  const [game] = await db.select().from(games).where(eq(games.code, upperCode));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  // Verifica stato lobby
  if (game.status !== 'lobby') {
    return NextResponse.json(
      { error: 'Le categorie si possono selezionare solo prima che la partita inizi' },
      { status: 409 }
    );
  }

  // Verifica che chi chiama sia l'host
  const caller = await validateSession(db, playerId, sessionToken, game.id);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!caller.isHost) {
    return NextResponse.json({ error: "Solo l'host può selezionare le categorie" }, { status: 403 });
  }

  // Verifica che tutte le categorie esistano
  const existingCats = await db
    .select({ id: categories.id })
    .from(categories)
    .where(inArray(categories.id, selectedCategoryIds));

  if (existingCats.length !== selectedCategoryIds.length) {
    return NextResponse.json({ error: 'Una o più categorie non esistono' }, { status: 400 });
  }

  // Calcola totalTurns = numero di beni nelle categorie selezionate
  const goodsInCategories = await db
    .select({ id: goods.id })
    .from(goods)
    .where(inArray(goods.categoryId, selectedCategoryIds));

  const totalTurns = goodsInCategories.length;

  // Salva sul DB
  const [updated] = await db
    .update(games)
    .set({
      selectedCategoryIds: selectedCategoryIds,
      totalTurns,
    })
    .where(eq(games.code, upperCode))
    .returning();

  // Notifica tutti i giocatori via Pusher
  await pusherServer.trigger(`game-${upperCode}`, 'categories-selected', {
    selectedCategoryIds,
    totalTurns,
  });

  return NextResponse.json({ game: updated, totalTurns });
}

/**
 * GET /api/games/[code]/categories
 * Restituisce le categorie attualmente selezionate per la partita.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const [game] = await db.select().from(games).where(eq(games.code, upperCode));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  const ids = (game.selectedCategoryIds as number[]) ?? [];

  if (ids.length === 0) {
    return NextResponse.json({ selectedCategories: [], totalTurns: game.totalTurns });
  }

  const selectedCategories = await db
    .select()
    .from(categories)
    .where(inArray(categories.id, ids));

  return NextResponse.json({ selectedCategories, totalTurns: game.totalTurns });
}
