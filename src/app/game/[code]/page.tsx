'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getPusherClient } from '@/lib/pusher-client';
import type { Bid } from '@/types/game';

interface Good {
  id: number;
  name: string;
  categoryId: number;
  baseValue: number;
}

interface Player {
  id: number;
  name: string;
  credits: number;
  isHost: boolean;
  usedMercatoNero: boolean;
  usedScugnizzu: boolean;
}

interface AuctionState {
  id: number;
  turn: number;
  totalTurns: number;
  status: 'bidding' | 'revealing' | 'finished';
  good: Good;
  isEventTurn: boolean;
  timerSeconds: number;
}

interface GameEvent {
  id: number;
  name: string;
  type: string;
  description: string;
  effect: Record<string, unknown>;
}

interface HistoryEntry {
  goodName: string;
  pricePaid: number;
  turn: number;
}

function getSessionKey(code: string) {
  return `asta-player-${code}`;
}
function loadSession(code: string): { id: number; name: string; isHost: boolean } | null {
  try {
    const raw = localStorage.getItem(getSessionKey(code));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// Toast notification component
function Toast({ message, color = 'yellow' }: { message: string; color?: 'yellow' | 'orange' | 'red' }) {
  const colorMap = {
    yellow: 'bg-yellow-500/90 text-gray-900',
    orange: 'bg-orange-500/90 text-white',
    red: 'bg-red-600/90 text-white',
  };
  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl font-semibold text-sm shadow-xl animate-bounce ${colorMap[color]}`}>
      {message}
    </div>
  );
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();

  const [myPlayer, setMyPlayer] = useState<Player | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [auction, setAuction] = useState<AuctionState | null>(null);
  const [phase, setPhase] = useState<'waiting' | 'bidding' | 'revealing' | 'finished'>('waiting');

  // Bidding
  const [bidAmount, setBidAmount] = useState('');
  const [useMercatoNero, setUseMercatoNero] = useState(false);
  const [hasBid, setHasBid] = useState(false);
  const [bidError, setBidError] = useState('');
  const [bidLoading, setBidLoading] = useState(false);

  // Conferme offerte (per host)
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);

  // Revealing
  const [revealedBids, setRevealedBids] = useState<(Bid & { playerName: string })[]>([]);
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const [winningBid, setWinningBid] = useState<number>(0);
  const [resultDetails, setResultDetails] = useState('');

  // Scugnizzu
  const [scugnizzuLoading, setScugnizzuLoading] = useState(false);
  const [scugnizzuMessage, setScugnizzuMessage] = useState('');

  // Tutti gli eventi attivi accumulati
  const [activeEvents, setActiveEvents] = useState<GameEvent[]>([]);
  const [showEventsBanner, setShowEventsBanner] = useState(false);

  // Storico beni per giocatore: playerId -> HistoryEntry[]
  const [goodsHistory, setGoodsHistory] = useState<Record<number, HistoryEntry[]>>({});

  // Storico aperto
  const [openHistoryPlayerId, setOpenHistoryPlayerId] = useState<number | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; color: 'yellow' | 'orange' | 'red' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(message: string, color: 'yellow' | 'orange' | 'red' = 'yellow') {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, color });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  // Timer
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startTimer = useCallback((seconds: number) => {
    stopTimer();
    setTimeLeft(seconds);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { stopTimer(); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, [stopTimer]);

  // Init
  useEffect(() => {
    const session = loadSession(code);
    if (!session) { router.push(`/lobby/${code}`); return; }

    async function init() {
      const [gameRes, auctionRes] = await Promise.all([
        fetch(`/api/games/${code}`),
        fetch(`/api/games/${code}/auction`),
      ]);
      const gameData = await gameRes.json();
      if (!gameRes.ok) { router.push('/'); return; }
      if (gameData.game?.status === 'finished') { router.push(`/game/${code}/results`); return; }

      const me = gameData.players?.find((p: Player) => p.id === session!.id);
      if (me) setMyPlayer(me);
      setPlayers(gameData.players ?? []);
      setTotalPlayers((gameData.players ?? []).length);

      if (auctionRes.ok) {
        const aData = await auctionRes.json();
        if (aData.auction) {
          setAuction({
            id: aData.auction.id,
            turn: aData.auction.turn,
            totalTurns: gameData.game.totalTurns,
            status: aData.auction.status,
            good: aData.auction.good,
            isEventTurn: false,
            timerSeconds: 45,
          });
          setPhase(aData.auction.status === 'revealing' ? 'revealing' : 'bidding');
          if (aData.auction.status === 'bidding') startTimer(45);
          if (aData.auction.status === 'revealing' && aData.bids) {
            setRevealedBids(aData.bids);
          }
        }
      }
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pusher
  useEffect(() => {
    const session = loadSession(code);
    if (!session) return;
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`game-${code}`);

    channel.bind('auction-started', (data: {
      auction: { id: number; turn: number; good: Good; status: string };
      turn: number; totalTurns: number; isEventTurn: boolean; timerSeconds: number;
      event: GameEvent | null;
    }) => {
      // Accumula eventi: se arriva un nuovo evento, aggiungilo alla lista
      if (data.event) {
        setActiveEvents(prev => {
          const alreadyIn = prev.some(e => e.id === data.event!.id);
          if (alreadyIn) return prev;
          return [...prev, data.event!];
        });
        setShowEventsBanner(true);
      }

      setAuction({
        id: data.auction.id,
        turn: data.turn,
        totalTurns: data.totalTurns,
        status: 'bidding',
        good: data.auction.good,
        isEventTurn: data.isEventTurn,
        timerSeconds: data.timerSeconds,
      });
      setPhase('bidding');
      setHasBid(false);
      setBidAmount('');
      setUseMercatoNero(false);
      setBidError('');
      setRevealedBids([]);
      setWinnerId(null);
      setWinningBid(0);
      setResultDetails('');
      setScugnizzuMessage('');
      setConfirmedCount(0);
      startTimer(data.timerSeconds);
    });

    channel.bind('bid-confirmed', (data: { auctionId: number; confirmedCount: number; totalPlayers: number }) => {
      setConfirmedCount(data.confirmedCount);
      setTotalPlayers(data.totalPlayers);
    });

    channel.bind('bids-revealed', (data: {
      auctionId: number; bids: (Bid & { playerName: string })[];
      winnerId: number | null; winningBid: number; details: string;
      players: Player[];
      goodId?: number;
      turn?: number;
    }) => {
      stopTimer();
      setPhase('revealing');
      setRevealedBids(data.bids);
      setWinnerId(data.winnerId);
      setWinningBid(data.winningBid);
      setResultDetails(data.details);
      setPlayers(data.players);
      setMyPlayer(prev => data.players.find(p => p.id === prev?.id) ?? prev);

      // Aggiorna storico beni
      if (data.winnerId && data.goodId) {
        setGoodsHistory(prev => {
          const existing = prev[data.winnerId!] ?? [];
          const goodName = data.bids[0] ? '' : '';
          const entry: HistoryEntry = {
            goodName: goodName,
            pricePaid: data.winningBid,
            turn: data.turn ?? 0,
          };
          return { ...prev, [data.winnerId!]: [...existing, entry] };
        });
      }
    });

    channel.bind('auction-closed', (data?: { goodId?: number; goodName?: string; winnerId?: number; winningBid?: number; turn?: number }) => {
      setPhase('waiting');
      setAuction(null);
      // Aggiorna storico con nome bene (arriva da close)
      if (data?.winnerId && data?.goodName) {
        setGoodsHistory(prev => {
          const existing = prev[data.winnerId!] ?? [];
          const alreadyIn = existing.some(e => e.turn === data.turn);
          if (alreadyIn) {
            return {
              ...prev,
              [data.winnerId!]: existing.map(e =>
                e.turn === data.turn ? { ...e, goodName: data.goodName! } : e
              ),
            };
          }
          return {
            ...prev,
            [data.winnerId!]: [...existing, {
              goodName: data.goodName!,
              pricePaid: data.winningBid ?? 0,
              turn: data.turn ?? 0,
            }],
          };
        });
      }
    });

    channel.bind('scugnizzu-used', (data: {
      playerId: number; playerName: string; newCredits: number;
    }) => {
      setPlayers(prev => prev.map(p =>
        p.id === data.playerId ? { ...p, credits: data.newCredits, usedScugnizzu: true } : p
      ));
      setMyPlayer(prev =>
        prev?.id === data.playerId ? { ...prev, credits: data.newCredits, usedScugnizzu: true } : prev
      );
      showToast(`🧑‍🔧 ${data.playerName} ha usato lo Scugnizzu! (+30 crediti)`, 'orange');
    });

    channel.bind('game-finished', () => {
      router.push(`/game/${code}/results`);
    });

    return () => { channel.unbind_all(); pusher.unsubscribe(`game-${code}`); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function handleBid() {
    if (!myPlayer || !auction) return;

    const amount = useMercatoNero ? 0 : parseInt(bidAmount);
    if (!useMercatoNero && (isNaN(amount) || amount < 0)) { setBidError('Inserisci un importo valido'); return; }
    if (!useMercatoNero && amount > myPlayer.credits) { setBidError('Crediti insufficienti'); return; }

    setBidLoading(true);
    setBidError('');
    const res = await fetch(`/api/games/${code}/auction/bid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: myPlayer.id, amount, isMercatoNero: useMercatoNero }),
    });
    const data = await res.json();
    if (!res.ok) { setBidError(data.error); setBidLoading(false); return; }
    setHasBid(true);
    setBidLoading(false);
  }

  async function handleReveal() {
    if (!myPlayer?.isHost) return;
    await fetch(`/api/games/${code}/auction/reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: myPlayer.id }),
    });
  }

  async function handleClose() {
    if (!myPlayer?.isHost) return;
    await fetch(`/api/games/${code}/auction/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: myPlayer.id }),
    });
  }

  async function handleNextAuction() {
    if (!myPlayer?.isHost) return;
    await fetch(`/api/games/${code}/auction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: myPlayer.id }),
    });
  }

  async function handleScugnizzu() {
    if (!myPlayer || myPlayer.usedScugnizzu) return;
    setScugnizzuLoading(true);
    setScugnizzuMessage('');
    const res = await fetch(`/api/games/${code}/scugnizzu`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: myPlayer.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setScugnizzuMessage(data.error);
    } else {
      setScugnizzuMessage(data.message);
    }
    setScugnizzuLoading(false);
  }

  const timerColor = timeLeft > 15 ? 'text-green-400' : timeLeft > 5 ? 'text-yellow-400' : 'text-red-400';
  const mercatoNeroWinner = winnerId
    ? revealedBids.find(b => b.playerId === winnerId && b.isMercatoNero)
    : null;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4 flex flex-col gap-4 max-w-lg mx-auto">

      {/* Toast globale */}
      {toast && <Toast message={toast.message} color={toast.color} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🎯 Asta Pazza</h1>
        <span className="font-mono text-yellow-400 tracking-widest">{code}</span>
      </div>

      {/* Crediti e turno */}
      <div className="bg-gray-900 rounded-2xl px-4 py-3 flex items-center justify-between">
        <span className="text-gray-400 text-sm">
          Turno <span className="text-white font-bold">{auction?.turn ?? '—'}</span>
          {auction ? <span className="text-gray-500"> / {auction.totalTurns}</span> : null}
        </span>
        <span className="text-sm">
          💰 <span className="font-bold text-yellow-400">{myPlayer?.credits ?? '—'}</span> crediti
        </span>
      </div>

      {/* Banner eventi attivi (tutti accumulati) */}
      {activeEvents.length > 0 && (
        <div className="bg-purple-900/60 border border-purple-500 rounded-2xl px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-purple-300 font-bold text-sm uppercase tracking-wide">
              ⚡ {activeEvents.length > 1 ? `${activeEvents.length} Eventi Attivi` : 'Evento Attivo'}
            </p>
            <button
              onClick={() => setShowEventsBanner(v => !v)}
              className="text-purple-400 hover:text-white text-xs"
            >
              {showEventsBanner ? '▲ chiudi' : '▼ mostra'}
            </button>
          </div>
          {showEventsBanner && (
            <div className="space-y-3 pt-1">
              {activeEvents.map((ev, i) => (
                <div key={ev.id} className={`space-y-0.5 ${i > 0 ? 'border-t border-purple-700 pt-2' : ''}`}>
                  <p className="text-xs text-purple-400 uppercase">{ev.type}</p>
                  <p className="text-white font-semibold text-sm">{ev.name}</p>
                  <p className="text-gray-300 text-xs">{ev.description}</p>
                </div>
              ))}
            </div>
          )}
          {!showEventsBanner && (
            <div className="flex flex-wrap gap-1">
              {activeEvents.map(ev => (
                <span key={ev.id} className="bg-purple-700/50 text-purple-200 text-xs px-2 py-0.5 rounded-full">{ev.name}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scugnizzu */}
      {myPlayer && !myPlayer.usedScugnizzu && (
        <div className="bg-gray-900 rounded-2xl px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-orange-400">🧑‍🔧 Scugnizzu</p>
              <p className="text-xs text-gray-400">+30 crediti ora, -15 punti a fine partita</p>
            </div>
            <button
              onClick={handleScugnizzu}
              disabled={scugnizzuLoading}
              className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold text-sm px-4 py-2 rounded-xl transition"
            >
              {scugnizzuLoading ? '...' : 'Usa'}
            </button>
          </div>
          {scugnizzuMessage && (
            <p className="text-xs text-orange-300">{scugnizzuMessage}</p>
          )}
        </div>
      )}

      {/* Fase: waiting */}
      {phase === 'waiting' && (
        <div className="bg-gray-900 rounded-2xl p-6 text-center space-y-4">
          <p className="text-gray-400">In attesa del prossimo bene...</p>
          {myPlayer?.isHost && (
            <button
              onClick={handleNextAuction}
              className="w-full bg-yellow-400 text-gray-950 font-bold py-3 rounded-xl hover:bg-yellow-300 transition"
            >
              🔨 Avvia prossima asta
            </button>
          )}
        </div>
      )}

      {/* Fase: bidding */}
      {phase === 'bidding' && auction && (
        <div className="bg-gray-900 rounded-2xl p-6 space-y-4">
          <div className="text-center space-y-1">
            <p className="text-gray-400 text-sm">In vendita</p>
            <h2 className="text-2xl font-bold">{auction.good.name}</h2>
            <p className="text-yellow-400 font-semibold">Valore base: {auction.good.baseValue} pt</p>
          </div>

          <div className="text-center">
            <span className={`text-4xl font-mono font-bold ${timerColor}`}>{timeLeft}s</span>
          </div>

          {!hasBid ? (
            <div className="space-y-3">
              {myPlayer && !myPlayer.usedMercatoNero && (
                <button
                  onClick={() => setUseMercatoNero(v => !v)}
                  className={`w-full py-2 rounded-xl text-sm font-medium transition border ${
                    useMercatoNero
                      ? 'bg-red-600 border-red-500 text-white'
                      : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-red-500'
                  }`}
                >
                  {useMercatoNero ? '🔴 Mercato Nero ATTIVO — clicca per annullare' : '🕵️ Usa Mercato Nero'}
                </button>
              )}

              {!useMercatoNero && (
                <input
                  type="number"
                  min={0}
                  max={myPlayer?.credits}
                  placeholder="La tua offerta"
                  value={bidAmount}
                  onChange={e => setBidAmount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleBid()}
                  className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                />
              )}

              {useMercatoNero && (
                <p className="text-red-300 text-xs text-center">Con Mercato Nero non devi inserire un&apos;offerta — vincerai pagando l&apos;offerta più alta + 1.</p>
              )}

              {bidError && <p className="text-red-400 text-sm">{bidError}</p>}

              <button
                onClick={handleBid}
                disabled={bidLoading || (!useMercatoNero && !bidAmount)}
                className="w-full bg-yellow-400 text-gray-950 font-bold py-3 rounded-xl hover:bg-yellow-300 disabled:opacity-50 transition"
              >
                {bidLoading ? 'Invio...' : useMercatoNero ? '🕵️ Dichiara Mercato Nero' : '✅ Conferma Offerta'}
              </button>
            </div>
          ) : (
            <div className="text-center space-y-2">
              <p className="text-green-400 font-semibold">
                {useMercatoNero ? '🕵️ Mercato Nero dichiarato!' : '✅ Offerta inviata!'}
              </p>
              <p className="text-gray-400 text-sm">In attesa degli altri giocatori...</p>
            </div>
          )}

          {myPlayer?.isHost && (
            <div className="space-y-2 mt-2">
              <div className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-2">
                <span className="text-gray-400 text-sm">Offerte ricevute</span>
                <span className="font-bold text-white">
                  {confirmedCount} / {totalPlayers}
                  {confirmedCount === totalPlayers && totalPlayers > 0 && (
                    <span className="ml-2 text-green-400 text-xs">✓ tutti</span>
                  )}
                </span>
              </div>
              <button
                onClick={handleReveal}
                className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-500 transition"
              >
                👁 Rivela Offerte
              </button>
            </div>
          )}
        </div>
      )}

      {/* Fase: revealing */}
      {phase === 'revealing' && auction && (
        <div className="bg-gray-900 rounded-2xl p-6 space-y-4">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold">{auction.good.name}</h2>
            <p className="text-gray-400 text-sm">Risultato asta</p>
          </div>

          {winnerId ? (
            <div className={`border rounded-xl px-4 py-3 text-center ${
              mercatoNeroWinner
                ? 'bg-red-900/40 border-red-500'
                : 'bg-yellow-400/10 border-yellow-400'
            }`}>
              {mercatoNeroWinner && (
                <p className="text-red-400 text-xs font-bold uppercase tracking-widest mb-1">🕵️ Vinto con Mercato Nero</p>
              )}
              <p className={`font-bold text-lg ${
                mercatoNeroWinner ? 'text-red-300' : 'text-yellow-400'
              }`}>
                🏆 {players.find(p => p.id === winnerId)?.name ?? 'Vincitore'}
              </p>
              <p className="text-gray-300 text-sm">
                ha vinto pagando <span className="font-bold text-white">{winningBid} crediti</span>
              </p>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-xl px-4 py-3 text-center">
              <p className="text-gray-400">🤝 {resultDetails}</p>
            </div>
          )}

          <ul className="space-y-2">
            {revealedBids.map(bid => (
              <li key={bid.playerId} className={`flex items-center justify-between bg-gray-800 rounded-xl px-4 py-2 ${
                bid.playerId === winnerId ? (mercatoNeroWinner && bid.isMercatoNero ? 'border border-red-500' : 'border border-yellow-400') : ''
              }`}>
                <span className="font-medium">
                  {bid.isMercatoNero && <span className="text-red-400 mr-1">🕵️</span>}
                  {bid.playerName}
                  {bid.isMercatoNero && <span className="text-red-400 text-xs ml-1">(MN)</span>}
                </span>
                <span className="font-bold">{bid.isMercatoNero ? '—' : `${bid.amount} cr`}</span>
              </li>
            ))}
          </ul>

          {myPlayer?.isHost && (
            <button
              onClick={handleClose}
              className="w-full bg-green-500 text-white font-bold py-3 rounded-xl hover:bg-green-400 transition"
            >
              ➡️ Prossimo bene
            </button>
          )}
          {!myPlayer?.isHost && (
            <p className="text-center text-gray-500 text-sm">In attesa che l&apos;host continui...</p>
          )}
        </div>
      )}

      {/* Giocatori, crediti e storico */}
      <div className="bg-gray-900 rounded-2xl p-4 space-y-2">
        <p className="text-gray-400 text-sm font-medium">Giocatori</p>
        <ul className="space-y-1">
          {players.map(p => (
            <li key={p.id}>
              <button
                className="w-full flex items-center justify-between text-sm py-1 hover:opacity-80 transition text-left"
                onClick={() => setOpenHistoryPlayerId(prev => prev === p.id ? null : p.id)}
              >
                <span className={p.id === myPlayer?.id ? 'font-bold text-yellow-400' : 'text-gray-300'}>
                  {p.name}{p.isHost ? ' 👑' : ''}
                  {p.usedScugnizzu && <span className="text-orange-400 ml-1 text-xs">(Scugnizzu)</span>}
                  {p.usedMercatoNero && <span className="text-red-400 ml-1 text-xs">(MN usato)</span>}
                </span>
                <span className="text-gray-400">💰 {p.credits}</span>
              </button>

              {openHistoryPlayerId === p.id && (
                <div className="mt-1 ml-2 mb-2 space-y-1">
                  {(goodsHistory[p.id] ?? []).length === 0 ? (
                    <p className="text-gray-600 text-xs italic">Nessun bene acquistato ancora.</p>
                  ) : (
                    (goodsHistory[p.id] ?? []).map((entry, i) => (
                      <div key={i} className="flex justify-between text-xs bg-gray-800 rounded-lg px-3 py-1">
                        <span className="text-gray-300">{entry.goodName || '(bene)'}</span>
                        <span className="text-yellow-400 font-bold">{entry.pricePaid} cr</span>
                        <span className="text-gray-600">T{entry.turn}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

    </main>
  );
}
