import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players, playerGoods, goods, categories, objectives, playerObjectives } from '@db/schema';
import { eq, and } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { SCUGNIZZU_PENALTY } from '@/lib/auction';

type Ctx = { params: Promise<{ code: string }> };

/**
 * GET /api/games/[code]/results
 * Ritorna la classifica finale con punteggi dettagliati.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const upperCode = code.toUpperCase();
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const [game] = await db.select().from(games).where(eq(games.code, upperCode));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  const allPlayers = await db.select().from(players).where(eq(players.gameId, game.id));
  const allGoods = await db.select().from(goods);
  const allCategories = await db.select().from(categories);

  // Beni posseduti per ogni giocatore
  const allPlayerGoods = await db
    .select({ pg: playerGoods, good: goods })
    .from(playerGoods)
    .innerJoin(goods, eq(playerGoods.goodId, goods.id))
    .where(eq(playerGoods.gameId, game.id));

  // Obiettivi completati per ogni giocatore
  const allPlayerObjectives = await db
    .select({ po: playerObjectives, obj: objectives })
    .from(playerObjectives)
    .innerJoin(objectives, eq(playerObjectives.objectiveId, objectives.id))
    .where(eq(playerObjectives.gameId, game.id));

  const results = allPlayers.map(player => {
    const myGoods = allPlayerGoods.filter(r => r.pg.playerId === player.id);
    const myObjectives = allPlayerObjectives.filter(r => r.po.playerId === player.id);

    // Punteggio beni
    const goodsScore = myGoods.reduce((sum, { good }) => {
      let pts = good.baseValue;
      // Bonus categoria base
      if (player.baseCategoryId && good.categoryId === player.baseCategoryId) pts += 10;
      return sum + pts;
    }, 0);

    // Conteggio per collezioni
    const goodsByCategory: Record<number, number> = {};
    myGoods.forEach(({ good }) => {
      goodsByCategory[good.categoryId] = (goodsByCategory[good.categoryId] ?? 0) + 1;
    });

    // Bonus collezioni
    let collectionBonus = 0;
    for (const [catId, count] of Object.entries(goodsByCategory)) {
      const cat = allCategories.find(c => c.id === Number(catId));
      const totalInCat = allGoods.filter(g => g.categoryId === Number(catId)).length;
      if (count >= 2) collectionBonus += 5;   // Mini-collezione
      if (count === totalInCat) collectionBonus += 10; // Collezione completa
    }

    // Bonus maggioranza di categoria
    let majorityBonus = 0;
    for (const [catId, count] of Object.entries(goodsByCategory)) {
      const maxForCat = Math.max(...allPlayers.map(pl => {
        return allPlayerGoods.filter(r => r.pg.playerId === pl.id && r.good.categoryId === Number(catId)).length;
      }));
      if (count === maxForCat && count > 0) majorityBonus += 8;
    }

    // Punteggio obiettivi
    const objectivesScore = myObjectives.reduce((sum, { obj }) => sum + obj.rewardPoints, 0);

    // Crediti residui
    const creditsScore = player.credits;

    // Penalità Scugnizzu
    const scugnizzuPenalty = player.usedScugnizzu ? SCUGNIZZU_PENALTY : 0;

    const total = goodsScore + collectionBonus + majorityBonus + objectivesScore + creditsScore - scugnizzuPenalty;

    return {
      player: {
        id: player.id,
        name: player.name,
        credits: player.credits,
        usedScugnizzu: player.usedScugnizzu,
      },
      goods: myGoods.map(({ pg, good }) => ({
        id: good.id,
        name: good.name,
        baseValue: good.baseValue,
        categoryId: good.categoryId,
        pricePaid: pg.pricePaid,
        hasBaseBonus: player.baseCategoryId === good.categoryId,
      })),
      objectives: myObjectives.map(({ obj }) => ({
        id: obj.id,
        name: obj.name,
        points: obj.rewardPoints,
      })),
      score: {
        goods: goodsScore,
        collections: collectionBonus,
        majority: majorityBonus,
        objectives: objectivesScore,
        credits: creditsScore,
        scugnizzuPenalty: -scugnizzuPenalty,
        total,
      },
    };
  });

  results.sort((a, b) => b.score.total - a.score.total);

  return NextResponse.json({ game: { code: upperCode, status: game.status }, results });
}
