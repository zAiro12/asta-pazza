import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

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
  // Crea la tabella se non esiste
  await sql`
    CREATE TABLE IF NOT EXISTS game_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `;
  const rows = await sql`SELECT key, value FROM game_settings`;
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  // Default values
  const defaults: Record<string, string> = {
    auction_timer_seconds: '45',
    starting_credits: '150',
    scugnizzu_credits: '30',
    scugnizzu_penalty: '15',
    mini_collection_points: '5',
    full_collection_points: '15',
    majority_points: '10',
    credits_residual_enabled: 'true',
    credits_residual_max: '50',
  };
  return NextResponse.json({ ...defaults, ...settings });
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    CREATE TABLE IF NOT EXISTS game_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `;
  for (const [key, value] of Object.entries(body)) {
    await sql`
      INSERT INTO game_settings (key, value) VALUES (${key}, ${String(value)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  }
  return NextResponse.json({ ok: true });
}
