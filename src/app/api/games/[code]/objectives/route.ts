import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players, objectives, playerObjectives, playerObjectiveAssignments } from '@db/schema';
import { eq, and } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

type Ctx = { params: Promise<{ code: string }> };

/**
 * GET /api/games/[code]/objectives?playerId=<id>
 *
 * Visibilità:
 * - Bonus generali (collezioni, maggioranza) → pubblici, visibili a tutti, calcolati lato scoring
 *   Questa API li descrive staticamente come regole note.
 * - comune / raro / categoria_base → PRIVATI, visibili solo al giocatore a cui sono assegnati
 *
 * Risposta:
 * - generalBonuses     : regole bonus pubbliche (fisse, descrittive)
 * - personalObjectives : obiettivi assegnati al giocatore chiamante (comune + raro + categoria_base)
 * - completed          : array degli objectiveId già completati dal giocatore
 *
 * Se playerId non è fornito, personalObjectives è [] e completed è [].
 */

const GENERAL_BONUSES = [
  {
    id: 'mini_collection',
    name: 'Mini-Collezione',
    description: '2 beni su 3 della stessa categoria.',
    points: null, // definiti in scoring.ts
  },
  {
    id: 'full_collection',
    name: 'Collezione Completa',
    description: 'Tutti e 3 i beni di una categoria.',
    points: null,
  },
  {
    id: 'category_majority',
    name: 'Maggioranza di Categoria',
    description: 'Più beni di qualsiasi altro giocatore in una categoria.',
    points: null,
  },
  {
    id: 'residual_credits',
    name: 'Crediti Residui',
    description: 'Ogni credito rimasto vale 1 punto a fine partita.',
    points: 1, // per credito
  },
];

export async function GET(request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId') ? Number(searchParams.get('playerId')) : null;

  const db = drizzle(neon(process.env.DATABASE_URL!));

  const [game] = await db.select().from(games).where(eq(games.code, code.toUpperCase()));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  let personalObjectives: typeof objectives.$inferSelect[] = [];
  let completed: number[] = [];

  if (playerId) {
    const [player] = await db.select().from(players).where(eq(players.id, playerId));
    if (!player || player.gameId !== game.id) {
      return NextResponse.json({ error: 'Giocatore non trovato' }, { status: 403 });
    }

    // Obiettivi assegnati a questo giocatore in questa partita
    const assignments = await db
      .select()
      .from(playerObjectiveAssignments)
      .where(
        and(
          eq(playerObjectiveAssignments.playerId, playerId),
          eq(playerObjectiveAssignments.gameId, game.id)
        )
      );

    if (assignments.length > 0) {
      const assignedIds = assignments.map(a => a.objectiveId);
      const allObjectives = await db.select().from(objectives);
      personalObjectives = allObjectives.filter(o => assignedIds.includes(o.id));
    }

    // Obiettivi già completati
    const completedRows = await db
      .select()
      .from(playerObjectives)
      .where(
        and(
          eq(playerObjectives.playerId, playerId),
          eq(playerObjectives.gameId, game.id)
        )
      );
    completed = completedRows.map(r => r.objectiveId);
  }

  return NextResponse.json({
    generalBonuses: GENERAL_BONUSES, // pubblici, visibili a tutti
    personalObjectives,              // privati, solo del giocatore chiamante
    completed,
  });
}
