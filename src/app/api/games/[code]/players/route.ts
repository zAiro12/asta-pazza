import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players } from '@db/schema';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { pusherServer } from '@/lib/pusher-server';
import { randomBytes } from 'crypto';

type Ctx = { params: Promise<{ code: string }> };

// GET /api/games/[code]/players — lista giocatori
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle({ client: sql });

  const [game] = await db.select().from(games).where(eq(games.code, code.toUpperCase()));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });

  const allPlayers = await db.select().from(players).where(eq(players.gameId, game.id));
  return NextResponse.json(allPlayers);
}

// POST /api/games/[code]/players — entra in partita
export async function POST(request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const { playerName } = await request.json();

  if (!playerName) {
    return NextResponse.json({ error: 'Nome obbligatorio' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle({ client: sql });

  const [game] = await db.select().from(games).where(eq(games.code, code.toUpperCase()));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });
  if (game.status !== 'lobby') return NextResponse.json({ error: 'La partita è già iniziata' }, { status: 400 });

  const existing = await db.select().from(players).where(eq(players.gameId, game.id));
  const isHost = existing.length === 0;

  const [player] = await db
    .insert(players)
    .values({
      gameId: game.id,
      name: playerName,
      sessionToken: randomBytes(32).toString('hex'),
      credits: 150,
      isHost
    })
    .returning();

  const allPlayers = await db.select().from(players).where(eq(players.gameId, game.id));

  await pusherServer.trigger(`game-${code.toUpperCase()}`, 'player-joined', { players: allPlayers });

  return NextResponse.json({ player, game, allPlayers }, { status: 201 });
}
