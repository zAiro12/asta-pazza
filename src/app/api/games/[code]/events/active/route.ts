import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, gameEvents, events } from '@db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import type { GameEvent } from '@/types/game';

type Ctx = { params: Promise<{ code: string }> };

// GET /api/games/[code]/events/active
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const upperCode = code.toUpperCase();
  const db = drizzle(process.env.DATABASE_URL!);

  const [game] = await db.select().from(games).where(eq(games.code, upperCode));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  const rows = await db
    .select({ eventId: gameEvents.eventId })
    .from(gameEvents)
    .where(and(eq(gameEvents.gameId, game.id), eq(gameEvents.isActive, true)));

  const ids = [...new Set(rows.map(r => r.eventId))];
  if (ids.length === 0) return NextResponse.json({ events: [] });

  const raw = await db.select().from(events).where(inArray(events.id, ids));
  const active: GameEvent[] = raw.map(e => ({
    id: e.id,
    name: e.name,
    type: e.type,
    description: e.description,
    effect: e.effect as GameEvent['effect'],
  }));

  return NextResponse.json({ events: active });
}
