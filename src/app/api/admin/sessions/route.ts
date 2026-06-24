import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return false;
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT email FROM admin_whitelist WHERE email = ${session.user.email} LIMIT 1`;
  return rows.length > 0 || session.user.email === 'lucaairoldi92@gmail.com';
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT g.*, COUNT(p.id)::int AS player_count
    FROM games g
    LEFT JOIN players p ON p.game_id = g.id
    GROUP BY g.id
    ORDER BY g.created_at DESC
    LIMIT 100
  `;
  return NextResponse.json(rows);
}
