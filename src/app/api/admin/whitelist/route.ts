import { NextRequest, NextResponse } from 'next/server';
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
  await sql`CREATE TABLE IF NOT EXISTS admin_whitelist (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL)`;
  const rows = await sql`SELECT * FROM admin_whitelist ORDER BY id`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { email } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);
  await sql`CREATE TABLE IF NOT EXISTS admin_whitelist (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL)`;
  const rows = await sql`INSERT INTO admin_whitelist (email) VALUES (${email}) ON CONFLICT DO NOTHING RETURNING *`;
  return NextResponse.json(rows[0] ?? { error: 'already exists' });
}
