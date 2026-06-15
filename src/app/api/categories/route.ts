import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { categories } from '@db/schema';
import { NextResponse } from 'next/server';

export async function GET() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);
  const cats = await db.select().from(categories).orderBy(categories.name);
  return NextResponse.json(cats);
}
