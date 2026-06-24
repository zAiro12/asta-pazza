import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { categories, goods } from '@db/schema';
import { eq, sql as sqlExpr } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function GET() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle({ client: sql });

  // Carica categorie con conteggio beni per ciascuna
  const cats = await db.select().from(categories).orderBy(categories.name);

  const counts = await db
    .select({
      categoryId: goods.categoryId,
      count: sqlExpr<number>`cast(count(*) as int)`,
    })
    .from(goods)
    .groupBy(goods.categoryId);

  const countMap = Object.fromEntries(counts.map(r => [r.categoryId, r.count]));

  const result = cats.map(c => ({ ...c, itemCount: countMap[c.id] ?? 0 }));

  return NextResponse.json(result);
}
