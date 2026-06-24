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
  const rows = await sql`SELECT * FROM events ORDER BY id`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, type, description, effect } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);
  const effectJson = typeof effect === 'string' ? effect : JSON.stringify(effect);
  const rows = await sql`
    INSERT INTO events (name, type, description, effect)
    VALUES (${name}, ${type}, ${description}, ${effectJson}::jsonb)
    RETURNING *
  `;
  return NextResponse.json(rows[0]);
}
