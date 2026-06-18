import type { Bid, Player } from '@/types/game';

export const AUCTION_TIMER_SECONDS = 45;
export const STARTING_CREDITS = 150;
export const SCUGNIZZU_CREDITS = 30;
export const SCUGNIZZU_PENALTY = 15;

/**
 * Determina il vincitore di un'asta.
 * Gestisce il caso Mercato Nero: vince pagando max_altri + 1.
 */
export function resolveAuction(bids: Bid[], players: Player[]): {
  winnerId: number | null;
  winningBid: number;
  details: string;
  tiedPlayerIds?: number[];
} {
  if (bids.length === 0) return { winnerId: null, winningBid: 0, details: 'Nessuna offerta' };

  const mercatoNeroBids = bids.filter(b => b.isMercatoNero);
  const normalBids = bids.filter(b => !b.isMercatoNero);

  if (mercatoNeroBids.length > 0) {
    // Mercato Nero: vince pagando max(offerte normali) + 1
    const maxNormal = normalBids.length > 0
      ? Math.max(...normalBids.map(b => b.amount))
      : 0;
    const mnBid = mercatoNeroBids[0]; // al massimo 1 per partita per giocatore
    const finalAmount = maxNormal + 1;

    return {
      winnerId: mnBid.playerId,
      winningBid: finalAmount,
      details: `Mercato Nero: ${mnBid.playerName} vince pagando ${finalAmount} (max altri: ${maxNormal})`,
      tiedPlayerIds: [],
    };
  }

  // Asta normale: vince il massimo offerente
  const maxBid = Math.max(...bids.map(b => b.amount));
  const winners = bids.filter(b => b.amount === maxBid);

  if (winners.length === 1) {
    return {
      winnerId: winners[0].playerId,
      winningBid: maxBid,
      details: `${winners[0].playerName} vince con ${maxBid} crediti`,
      tiedPlayerIds: [],
    };
  }

  // Pareggio: nessuno vince (bene non assegnato)
  return {
    winnerId: null,
    winningBid: maxBid,
    details: `Pareggio a ${maxBid} — spareggio necessario`,
    tiedPlayerIds: winners.map(w => w.playerId),
  };
}

/**
 * Genera un codice sala casuale di 4 lettere maiuscole.
 */
export function generateRoomCode(): string {
  return Array.from({ length: 4 }, () =>
    'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]
  ).join('');
}

/**
 * Determina se un turno è un turno evento.
 */
export function isEventTurn(turn: number, totalTurns: number): boolean {
  return turn % 10 === 0 || turn === totalTurns;
}
