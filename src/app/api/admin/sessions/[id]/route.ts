import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/[...nextauth]/route';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return false;
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT email FROM admin_whitelist WHERE email = ${session.user.email} LIMIT 1`;
  return rows.length > 0 || session.user.email === 'lucaairoldi92@gmail.com';
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const id = params.id;
  // Cancella in cascata
  await sql`DELETE FROM tiebreak_bids WHERE auction_id IN (SELECT id FROM auctions WHERE game_id=${id})`;
  await sql`DELETE FROM bids WHERE auction_id IN (SELECT id FROM auctions WHERE game_id=${id})`;
  await sql`DELETE FROM auctions WHERE game_id=${id}`;
  await sql`DELETE FROM player_objective_assignments WHERE game_id=${id}`;
  await sql`DELETE FROM player_objectives WHERE game_id=${id}`;
  await sql`DELETE FROM player_goods WHERE game_id=${id}`;
  await sql`DELETE FROM game_events WHERE game_id=${id}`;
  await sql`DELETE FROM players WHERE game_id=${id}`;
  await sql`DELETE FROM games WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}

export async function PATCH(_: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  // Forza chiusura della partita
  await sql`UPDATE games SET status='finished', finished_at=NOW() WHERE id=${params.id}`;
  return NextResponse.json({ ok: true });
}
