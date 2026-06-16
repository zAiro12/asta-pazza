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

function getSessionKey(code: string) {
  return `asta-player-${code}`;
}
function loadSession(code: string): { id: number; name: string; isHost: boolean } | null {
  try {
    const raw = localStorage.getItem(getSessionKey(code));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
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

  // Revealing
  const [revealedBids, setRevealedBids] = useState<(Bid & { playerName: string })[]>([]);
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const [winningBid, setWinningBid] = useState<number>(0);
  const [resultDetails, setResultDetails] = useState('');

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

  // Init: carica sessione + stato attuale
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
    }) => {
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
      startTimer(data.timerSeconds);
    });

    channel.bind('bids-revealed', (data: {
      auctionId: number; bids: (Bid & { playerName: string })[];
      winnerId: number | null; winningBid: number; details: string;
      players: Player[];
    }) => {
      stopTimer();
      setPhase('revealing');
      setRevealedBids(data.bids);
      setWinnerId(data.winnerId);
      setWinningBid(data.winningBid);
      setResultDetails(data.details);
      setPlayers(data.players);
      setMyPlayer(prev => data.players.find(p => p.id === prev?.id) ?? prev);
    });

    channel.bind('auction-closed', () => {
      setPhase('waiting');
      setAuction(null);
    });

    channel.bind('game-finished', () => {
      router.push(`/game/${code}/results`);
    });

    return () => { channel.unbind_all(); pusher.unsubscribe(`game-${code}`); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function handleBid() {
    if (!myPlayer || !auction) return;
    const amount = parseInt(bidAmount);
    if (isNaN(amount) || amount < 0) { setBidError('Inserisci un importo valido'); return; }
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

  const timerColor = timeLeft > 15 ? 'text-green-400' : timeLeft > 5 ? 'text-yellow-400' : 'text-red-400';

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4 flex flex-col gap-4 max-w-lg mx-auto">

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
          {auction.isEventTurn && (
            <div className="bg-purple-500/20 border border-purple-500 rounded-xl px-4 py-2 text-purple-300 text-sm font-medium text-center">
              ⚡ Turno Evento!
            </div>
          )}

          {/* Bene in vendita */}
          <div className="text-center space-y-1">
            <p className="text-gray-400 text-sm">In vendita</p>
            <h2 className="text-2xl font-bold">{auction.good.name}</h2>
            <p className="text-yellow-400 font-semibold">Valore base: {auction.good.baseValue} pt</p>
          </div>

          {/* Timer */}
          <div className="text-center">
            <span className={`text-4xl font-mono font-bold ${timerColor}`}>{timeLeft}s</span>
          </div>

          {/* Form offerta */}
          {!hasBid ? (
            <div className="space-y-3">
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

              {/* Mercato Nero */}
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

              {bidError && <p className="text-red-400 text-sm">{bidError}</p>}

              <button
                onClick={handleBid}
                disabled={bidLoading || !bidAmount}
                className="w-full bg-yellow-400 text-gray-950 font-bold py-3 rounded-xl hover:bg-yellow-300 disabled:opacity-50 transition"
              >
                {bidLoading ? 'Invio...' : useMercatoNero ? '🕵️ Conferma Mercato Nero' : '✅ Conferma Offerta'}
              </button>
            </div>
          ) : (
            <div className="text-center space-y-2">
              <p className="text-green-400 font-semibold">✅ Offerta inviata!</p>
              <p className="text-gray-400 text-sm">In attesa degli altri giocatori...</p>
            </div>
          )}

          {/* Host: rivela offerte */}
          {myPlayer?.isHost && (
            <button
              onClick={handleReveal}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-500 transition mt-2"
            >
              👁 Rivela Offerte
            </button>
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

          {/* Vincitore */}
          {winnerId ? (
            <div className="bg-yellow-400/10 border border-yellow-400 rounded-xl px-4 py-3 text-center">
              <p className="text-yellow-400 font-bold text-lg">
                🏆 {players.find(p => p.id === winnerId)?.name ?? 'Vincitore'}
              </p>
              <p className="text-gray-300 text-sm">ha vinto pagando <span className="font-bold text-white">{winningBid} crediti</span></p>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-xl px-4 py-3 text-center">
              <p className="text-gray-400">🤝 {resultDetails}</p>
            </div>
          )}

          {/* Lista offerte */}
          <ul className="space-y-2">
            {revealedBids.map(bid => (
              <li key={bid.playerId} className={`flex items-center justify-between bg-gray-800 rounded-xl px-4 py-2 ${
                bid.playerId === winnerId ? 'border border-yellow-400' : ''
              }`}>
                <span className="font-medium">
                  {bid.isMercatoNero && <span className="text-red-400 mr-1">🕵️</span>}
                  {bid.playerName}
                </span>
                <span className="font-bold">{bid.amount} cr</span>
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

      {/* Giocatori e crediti */}
      <div className="bg-gray-900 rounded-2xl p-4 space-y-2">
        <p className="text-gray-400 text-sm font-medium">Giocatori</p>
        <ul className="space-y-1">
          {players.map(p => (
            <li key={p.id} className="flex items-center justify-between text-sm">
              <span className={p.id === myPlayer?.id ? 'font-bold text-yellow-400' : 'text-gray-300'}>
                {p.name}{p.isHost ? ' 👑' : ''}
              </span>
              <span className="text-gray-400">💰 {p.credits}</span>
            </li>
          ))}
        </ul>
      </div>

    </main>
  );
}
