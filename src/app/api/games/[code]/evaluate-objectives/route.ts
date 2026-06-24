import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players, playerGoods, goods, categories, objectives, playerObjectives } from '@db/schema';
import { eq, inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getCompletedObjectiveIds } from '@/lib/objectives';
import type { ObjectiveRow } from '@/lib/objectives';
import type { PlayerWithGoods, Good } from '@/types/game';
import { validateSession } from '@/lib/session';

type Ctx = { params: Promise<{ code: string }> };

/**
 * POST /api/games/[code]/evaluate-objectives
 * Chiamato una volta a fine partita (dal close route quando finished=true o dal frontend).
 * Valuta gli obiettivi di ogni giocatore e li scrive in player_objectives.
 * Idempotente: non riscrive obiettivi già assegnati.
 * Body: { playerId: number, sessionToken: string } — deve essere l'host
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const upperCode = code.toUpperCase();
  const body = await request.json();
  const db = drizzle(process.env.DATABASE_URL!);

  const [game] = await db.select().from(games).where(eq(games.code, upperCode));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });
  if (game.status !== 'finished') return NextResponse.json({ error: 'La partita non è ancora terminata' }, { status: 409 });

  const caller = await validateSession(db, body.playerId, body.sessionToken, game.id);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!caller.isHost) return NextResponse.json({ error: "Solo l'host può avviare la valutazione" }, { status: 403 });

  // Carica tutti i giocatori
  const allPlayers = await db.select().from(players).where(eq(players.gameId, game.id));

  // Carica i beni posseduti
  const allPlayerGoods = await db
    .select({ pg: playerGoods, good: goods })
    .from(playerGoods)
    .innerJoin(goods, eq(playerGoods.goodId, goods.id))
    .where(eq(playerGoods.gameId, game.id));

  // Numero totale di beni per categoria (serve per valutare 'all_goods_in_category')
  const categoryIds = (game.selectedCategoryIds as number[]);
  const allGoods = await db
    .select()
    .from(goods)
    .where(inArray(goods.categoryId, categoryIds));

  const goodsInCategory = new Map<number, number>();
  for (const g of allGoods) {
    goodsInCategory.set(g.categoryId, (goodsInCategory.get(g.categoryId) ?? 0) + 1);
  }

  // Carica tutti gli obiettivi
  const rawObjectives = await db.select().from(objectives);
  const allObjectives: ObjectiveRow[] = rawObjectives.map(o => ({
    id: o.id,
    name: o.name,
    type: o.type,
    description: o.description,
    rewardPoints: o.points,
    condition: (o.condition as any) ?? null,
  }));

  // Obiettivi già assegnati in questa partita (idempotenza)
  const existing = await db
    .select()
    .from(playerObjectives)
    .where(eq(playerObjectives.gameId, game.id));
  const existingKeys = new Set(existing.map(e => `${e.playerId}_${e.objectiveId}`));

  // Costruisce PlayerWithGoods per ogni giocatore
  const playersWithGoods: PlayerWithGoods[] = allPlayers.map(player => {
    const myGoods: Good[] = allPlayerGoods
      .filter(r => r.pg.playerId === player.id)
      .map(({ good }) => ({
        id: good.id,
        name: good.name,
        categoryId: good.categoryId,
        categoryName: '',
        baseValue: good.baseValue,
      }));
    return {
      id: player.id,
      gameId: player.gameId,
      name: player.name,
      credits: player.credits,
      baseCategoryId: player.baseCategoryId,
      usedScugnizzu: player.usedScugnizzu ?? false,
      usedMercatoNero: player.usedMercatoNero ?? false,
      isHost: player.isHost,
      goods: myGoods,
    };
  });

  // Valuta e inserisce gli obiettivi completati
  const toInsert: { playerId: number; gameId: number; objectiveId: number }[] = [];
  const summary: Record<number, number[]> = {};

  for (const player of playersWithGoods) {
    const completedIds = getCompletedObjectiveIds(player, allObjectives, goodsInCategory);
    summary[player.id] = completedIds;

    for (const objectiveId of completedIds) {
      const key = `${player.id}_${objectiveId}`;
      if (!existingKeys.has(key)) {
        toInsert.push({ playerId: player.id, gameId: game.id, objectiveId });
      }
    }
  }

  if (toInsert.length > 0) {
    await db.insert(playerObjectives).values(toInsert);
  }

  return NextResponse.json({ ok: true, assigned: toInsert.length, summary });
}
