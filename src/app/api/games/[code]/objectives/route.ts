import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players, objectives, playerObjectives } from '@db/schema';
import { eq, inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

type Ctx = { params: Promise<{ code: string }> };

/**
 * GET /api/games/[code]/objectives?playerId=<id>
 *
 * Ritorna:
 * - commonObjectives  : obiettivi di tipo 'comune' e 'raro' — visibili a tutti
 * - personalObjective : obiettivo 'categoria_base' del giocatore chiamante — visibile solo a lui
 * - completed         : array degli objectiveId già completati dal giocatore
 *
 * Se playerId non è fornito, personalObjective e completed sono null/[].
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId') ? Number(searchParams.get('playerId')) : null;

  const db = drizzle(neon(process.env.DATABASE_URL!));

  const [game] = await db.select().from(games).where(eq(games.code, code.toUpperCase()));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  // Tutti gli obiettivi
  const allObjectives = await db.select().from(objectives);

  // Obiettivi comuni e rari → pubblici
  const commonObjectives = allObjectives.filter(
    o => o.type === 'comune' || o.type === 'raro'
  );

  // Obiettivo categoria_base del giocatore → privato
  let personalObjective = null;
  let completed: number[] = [];

  if (playerId) {
    const [player] = await db.select().from(players).where(eq(players.id, playerId));
    if (!player || player.gameId !== game.id) {
      return NextResponse.json({ error: 'Giocatore non trovato' }, { status: 403 });
    }

    // Obiettivo di categoria base: quello con condition.type = 'min_base_category_goods'
    // o direttamente type = 'categoria_base'
    const baseObjective = allObjectives.find(o => o.type === 'categoria_base');
    if (baseObjective) personalObjective = baseObjective;

    // Obiettivi già completati da questo giocatore in questa partita
    const completedRows = await db
      .select()
      .from(playerObjectives)
      .where(
        eq(playerObjectives.playerId, playerId)
      );
    completed = completedRows
      .filter(r => r.gameId === game.id)
      .map(r => r.objectiveId);
  }

  return NextResponse.json({
    commonObjectives,
    personalObjective,
    completed,
  });
}
