import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players, categories, goods, objectives, playerObjectiveAssignments } from '@db/schema';
import { eq, inArray, and } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { pusherServer } from '@/lib/pusher-server';
import { validateSession } from '@/lib/session';

type Ctx = { params: Promise<{ code: string }> };

// GET /api/games/[code] — stato partita + giocatori + mappa categorie + beni
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const [game] = await db.select().from(games).where(eq(games.code, code.toUpperCase()));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  const allPlayers = await db.select().from(players).where(eq(players.gameId, game.id));

  const categoryIds = (game.selectedCategoryIds ?? []) as number[];
  let categoriesMap: Record<number, string> = {};
  let allGoods: { id: number; name: string; categoryId: number; baseValue: number }[] = [];

  if (categoryIds.length > 0) {
    const cats = await db.select().from(categories).where(inArray(categories.id, categoryIds));
    for (const c of cats) categoriesMap[c.id] = c.name;
    allGoods = await db.select().from(goods).where(inArray(goods.categoryId, categoryIds));
  }

  return NextResponse.json({ game, players: allPlayers, categories: categoriesMap, goods: allGoods });
}

// PUT /api/games/[code] — aggiorna stato partita (es. avvia)
export async function PUT(request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const body = await request.json();

  if (!body.status || !body.playerId) {
    return NextResponse.json({ error: 'Campi status e playerId obbligatori' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const updateFields: Record<string, unknown> = { status: body.status };
  if (body.selectedCategoryIds !== undefined) updateFields.selectedCategoryIds = body.selectedCategoryIds;
  if (body.commonObjectivesCount !== undefined) updateFields.commonObjectivesCount = body.commonObjectivesCount;
  if (body.rareObjectivesCount !== undefined) updateFields.rareObjectivesCount = body.rareObjectivesCount;

  const [game] = await db
    .update(games)
    .set(updateFields)
    .where(eq(games.code, code.toUpperCase()))
    .returning();

  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  const caller = await validateSession(db, body.playerId, body.sessionToken, game.id);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!caller.isHost) return NextResponse.json({ error: "Solo l'host può aggiornare la partita" }, { status: 403 });

  if (body.status === 'active') {
    const allPlayers = await db.select().from(players).where(eq(players.gameId, game.id));
    const categoryIds = game.selectedCategoryIds as number[];

    // 1. Assegna categoria base
    if (categoryIds.length > 0) {
      const allCategories = await db
        .select()
        .from(categories)
        .where(inArray(categories.id, categoryIds));

      for (const player of allPlayers) {
        if (player.baseCategoryId !== null) continue;
        const randomCat = allCategories[Math.floor(Math.random() * allCategories.length)];
        await db
          .update(players)
          .set({ baseCategoryId: randomCat.id })
          .where(eq(players.id, player.id));
      }
    }

    // 2. Assegna obiettivi privati
    const existingAssignments = await db
      .select()
      .from(playerObjectiveAssignments)
      .where(eq(playerObjectiveAssignments.gameId, game.id));

    if (existingAssignments.length === 0) {
      const allObjectives = await db.select().from(objectives);
      const commonPool = allObjectives.filter(o => o.type === 'comune');
      const rarePool = allObjectives.filter(o => o.type === 'raro');
      const basePool = allObjectives.filter(o => o.type === 'categoria_base');

      const N = game.commonObjectivesCount ?? 1;
      const M = game.rareObjectivesCount ?? 1;

      function shuffle<T>(arr: T[]): T[] {
        return [...arr].sort(() => Math.random() - 0.5);
      }

      const freshPlayers = await db.select().from(players).where(eq(players.gameId, game.id));

      for (const player of freshPlayers) {
        const toInsert: { playerId: number; gameId: number; objectiveId: number; type: 'comune' | 'raro' | 'categoria_base' }[] = [];

        const pickedCommon = shuffle(commonPool).slice(0, N);
        for (const obj of pickedCommon) {
          toInsert.push({ playerId: player.id, gameId: game.id, objectiveId: obj.id, type: 'comune' });
        }

        const pickedRare = shuffle(rarePool).slice(0, M);
        for (const obj of pickedRare) {
          toInsert.push({ playerId: player.id, gameId: game.id, objectiveId: obj.id, type: 'raro' });
        }

        if (basePool.length > 0) {
          const specificPool = player.baseCategoryId
            ? basePool.filter(o => {
                const cond = (o.condition as any);
                return cond?.categoryId === player.baseCategoryId;
              })
            : [];

          const selectedBaseObj = specificPool.length > 0
            ? specificPool[Math.floor(Math.random() * specificPool.length)]
            : basePool[Math.floor(Math.random() * basePool.length)];

          toInsert.push({ playerId: player.id, gameId: game.id, objectiveId: selectedBaseObj.id, type: 'categoria_base' });
        }

        if (toInsert.length > 0) {
          await db.insert(playerObjectiveAssignments).values(toInsert);
        }
      }
    }

    // Broadcast game-started con mappa categorie
    const updatedPlayers = await db.select().from(players).where(eq(players.gameId, game.id));
    const categoryIds2 = game.selectedCategoryIds as number[];
    let categoriesMap: Record<number, string> = {};
    if (categoryIds2.length > 0) {
      const cats = await db.select().from(categories).where(inArray(categories.id, categoryIds2));
      for (const c of cats) categoriesMap[c.id] = c.name;
    }
    await pusherServer.trigger(`game-${code.toUpperCase()}`, 'game-started', {
      gameId: game.id,
      players: updatedPlayers,
      categories: categoriesMap,
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
