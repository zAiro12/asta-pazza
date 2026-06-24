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
  const rows = await sql`
    SELECT g.*, c.name AS category_name FROM goods g
    JOIN categories c ON c.id = g.category_id
    ORDER BY c.name, g.name
  `;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, categoryId, baseValue } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    INSERT INTO goods (name, category_id, base_value)
    VALUES (${name}, ${categoryId}, ${baseValue})
    RETURNING *
  `;
  return NextResponse.json(rows[0]);
}
