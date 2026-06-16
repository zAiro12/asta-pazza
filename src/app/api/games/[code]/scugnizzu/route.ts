import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players } from '@db/schema';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { pusherServer } from '@/lib/pusher-server';
import { SCUGNIZZU_CREDITS, SCUGNIZZU_PENALTY } from '@/lib/auction';

type Ctx = { params: Promise<{ code: string }> };

/**
 * POST /api/games/[code]/scugnizzu
 * Il giocatore usa il potere Scugnizzu: ottiene 30 crediti extra,
 * ma subisce una penalità di -15 punti a fine partita.
 * Body: { playerId: number }
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  let body: { playerId: number };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }); }

  const { playerId } = body;
  if (!playerId) return NextResponse.json({ error: 'playerId obbligatorio' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const [game] = await db.select().from(games).where(eq(games.code, upperCode));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });
  if (game.status !== 'active') return NextResponse.json({ error: 'Partita non attiva' }, { status: 409 });

  const [player] = await db.select().from(players).where(eq(players.id, playerId));
  if (!player || player.gameId !== game.id)
    return NextResponse.json({ error: 'Giocatore non trovato' }, { status: 403 });

  if (player.usedScugnizzu)
    return NextResponse.json({ error: 'Scugnizzu già usato in questa partita' }, { status: 409 });

  // Aggiunge crediti e marca come usato
  await sql`
    UPDATE players SET credits = credits + ${SCUGNIZZU_CREDITS}, used_scugnizzu = true WHERE id = ${playerId}
  `;

  const [updatedPlayer] = await db.select().from(players).where(eq(players.id, playerId));

  await pusherServer.trigger(`game-${upperCode}`, 'scugnizzu-used', {
    playerId,
    playerName: player.name,
    newCredits: updatedPlayer.credits,
    penalty: SCUGNIZZU_PENALTY,
  });

  return NextResponse.json({
    ok: true,
    newCredits: updatedPlayer.credits,
    penalty: SCUGNIZZU_PENALTY,
    message: `+${SCUGNIZZU_CREDITS} crediti ottenuti. Penalità di -${SCUGNIZZU_PENALTY} punti a fine partita.`,
  });
}
