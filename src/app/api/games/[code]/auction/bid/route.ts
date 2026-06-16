import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { games, players, auctions, bids } from '@db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

type Ctx = { params: Promise<{ code: string }> };

/**
 * POST /api/games/[code]/auction/bid
 * Il giocatore sottomette la propria offerta.
 * Body: { playerId: number, amount: number, isMercatoNero?: boolean }
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  let body: { playerId: number; amount: number; isMercatoNero?: boolean };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }); }

  const { playerId, amount, isMercatoNero = false } = body;

  if (!playerId || amount === undefined || amount < 0)
    return NextResponse.json({ error: 'playerId e amount obbligatori (amount >= 0)' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const [game] = await db.select().from(games).where(eq(games.code, upperCode));
  if (!game) return NextResponse.json({ error: 'Partita non trovata' }, { status: 404 });
  if (game.status !== 'active') return NextResponse.json({ error: 'Partita non attiva' }, { status: 409 });

  const [player] = await db.select().from(players).where(eq(players.id, playerId));
  if (!player || player.gameId !== game.id)
    return NextResponse.json({ error: 'Giocatore non trovato' }, { status: 403 });

  // Asta corrente in fase bidding
  const [auction] = await db
    .select()
    .from(auctions)
    .where(and(eq(auctions.gameId, game.id), eq(auctions.status, 'bidding')))
    .limit(1);
  if (!auction) return NextResponse.json({ error: 'Nessuna asta in corso' }, { status: 409 });

  // Controllo Mercato Nero — usabile solo una volta per partita
  if (isMercatoNero && player.usedMercatoNero)
    return NextResponse.json({ error: 'Mercato Nero già usato in questa partita' }, { status: 409 });

  // Controllo credits (non per Mercato Nero, il costo viene calcolato a rivelazione)
  if (!isMercatoNero && amount > player.credits)
    return NextResponse.json({ error: 'Crediti insufficienti' }, { status: 409 });

  // Upsert offerta: se il giocatore ha già offerto, aggiorna
  const [existing] = await db
    .select()
    .from(bids)
    .where(and(eq(bids.auctionId, auction.id), eq(bids.playerId, playerId)))
    .limit(1);

  if (existing) {
    await db.update(bids).set({ amount, isMercatoNero }).where(eq(bids.id, existing.id));
  } else {
    await db.insert(bids).values({ auctionId: auction.id, playerId, amount, isMercatoNero });
  }

  return NextResponse.json({ ok: true, auctionId: auction.id });
}
