'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getPusherClient } from '@/lib/pusher-client';
import { vibrate, unlockAudio } from '@/lib/vibration';
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
  baseCategoryId: number | null;
}

interface SessionPlayer {
  id: number;
  name: string;
  sessionToken: string;
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

interface Objective {
  id: number;
  name: string;
  description: string;
  points: number;
  rarity: 'common' | 'rare' | 'base_category';
}

interface GeneralBonus {
  id: string;
  name: string;
  description: string;
  points: number | null;
}

interface TiebreakRoundEntry {
  round: number;
  bids: { playerName: string; amount: number }[];
}

const GENERAL_BONUS_POINTS: Record<string, string> = {
  mini_collection: '10',
  full_collection: '20',
  category_majority: '25',
  residual_credits: '1 per credito',
};

function getSessionKey(code: string) {
  return `asta-player-${code}`;
}
function loadSession(code: string): SessionPlayer | null {
  try {
    const raw = localStorage.getItem(getSessionKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.sessionToken) return null;
    return parsed;
  } catch { return null; }
}

// ── Audio ─────────────────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return audioCtx;
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', gainVal = 0.18, delay = 0) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
  gain.gain.setValueAtTime(0, ctx.currentTime + delay);
  gain.gain.linearRampToValueAtTime(gainVal, ctx.currentTime + delay + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
  osc.start(ctx.currentTime + delay);
  osc.stop(ctx.currentTime + delay + duration);
}

function playChime(freqs: number[], gap = 0.12) {
  freqs.forEach((f, i) => playTone(f, 0.35, 'sine', 0.15, i * gap));
}

const sounds = {
  auctionStart: () => playChime([523, 659, 784]),          // Do Mi Sol — gioioso
  bidIn: () => playTone(880, 0.12, 'sine', 0.10),          // La breve — conferma
  reveal: () => playChime([392, 494, 587, 740], 0.09),     // Sol Si Re Fa# — suspense
  win: () => playChime([523, 659, 784, 1047], 0.10),       // Do Mi Sol Do — vittoria
  mercatoNero: () => { playTone(220, 0.18, 'sawtooth', 0.12); playTone(196, 0.25, 'sawtooth', 0.10, 0.20); },
  tiebreak: () => playChime([440, 415, 440], 0.15),        // La Lab La — tensione
  complete: () => playChime([784, 880, 1047], 0.08),       // obiettivo completato
};

function Toast({ message, color = 'yellow' }: { message: string; color?: 'yellow' | 'orange' | 'red' | 'green' }) {
  const colorMap = {
    yellow: 'bg-yellow-500/90 text-gray-900',
    orange: 'bg-orange-500/90 text-white',
    red: 'bg-red-600/90 text-white',
    green: 'bg-green-600/90 text-white',
  };
  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl font-semibold text-sm shadow-xl animate-bounce ${colorMap[color]}`}>
      {message}
    </div>
  );
}

const RARITY_STYLE: Record<string, string> = {
  base_category: 'border-yellow-500 bg-yellow-500/10 text-yellow-300',
  rare: 'border-purple-500 bg-purple-500/10 text-purple-300',
  common: 'border-blue-500 bg-blue-500/10 text-blue-300',
};
const RARITY_LABEL: Record<string, string> = {
  base_category: '⭐ Base',
  rare: '🟣 Raro',
  common: '🔵 Comune',
};

// ── CSS animations (injected once) ───────────────────────────────────────────
const ANIM_STYLES = `
@keyframes slideUpFade {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes mnShake {
  0%,100% { transform: translateX(0); }
  15%     { transform: translateX(-6px) rotate(-2deg); }
  35%     { transform: translateX(6px) rotate(2deg); }
  55%     { transform: translateX(-4px); }
  75%     { transform: translateX(4px); }
}
.bid-slide-up {
  animation: slideUpFade 0.28s cubic-bezier(0.22,1,0.36,1) both;
}
.bid-mn-shake {
  animation: slideUpFade 0.28s cubic-bezier(0.22,1,0.36,1) both,
             mnShake 0.55s cubic-bezier(0.22,1,0.36,1) 0.25s both;
}
`;

function InjectStyles() {
  useEffect(() => {
    if (document.getElementById('asta-anim-styles')) return;
    const el = document.createElement('style');
    el.id = 'asta-anim-styles';
    el.textContent = ANIM_STYLES;
    document.head.appendChild(el);
  }, []);
  return null;
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();

  const [myPlayer, setMyPlayer] = useState<Player | null>(null);
  const [session, setSession] = useState<SessionPlayer | null>(null);
  const sessionIdRef = useRef<number | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [auction, setAuction] = useState<AuctionState | null>(null);
  const [phase, setPhase] = useState<'waiting' | 'bidding' | 'revealing' | 'finished'>('waiting');
  const [categoriesMap, setCategoriesMap] = useState<Record<number, string>>({});
  const [allGoodsMap, setAllGoodsMap] = useState<Record<number, Good>>({});

  const [lastTurn, setLastTurn] = useState<number | null>(null);
  const [lastTotalTurns, setLastTotalTurns] = useState<number | null>(null);

  const [bidAmount, setBidAmount] = useState('');
  const [useMercatoNero, setUseMercatoNero] = useState(false);
  const [hasBid, setHasBid] = useState(false);
  const [bidError, setBidError] = useState('');
  const [bidLoading, setBidLoading] = useState(false);

  const [confirmedCount, setConfirmedCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [biddingPlayerIds, setBiddingPlayerIds] = useState<number[]>([]);

  const [revealedBids, setRevealedBids] = useState<(Bid & { playerName: string })[]>([]);
  const [visibleBidCount, setVisibleBidCount] = useState(0);
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const [winningBid, setWinningBid] = useState<number>(0);
  const [resultDetails, setResultDetails] = useState('');

  const [scugnizzuLoading, setScugnizzuLoading] = useState(false);
  const [scugnizzuMessage, setScugnizzuMessage] = useState('');

  const [activeEvents, setActiveEvents] = useState<GameEvent[]>([]);
  const [showEventsBanner, setShowEventsBanner] = useState(false);

  const [tiedPlayerIds, setTiedPlayerIds] = useState<number[]>([]);
  const [isMNTiebreak, setIsMNTiebreak] = useState(false);
  const [showTiebreakModal, setShowTiebreakModal] = useState(false);
  const [tiebreakAmount, setTiebreakAmount] = useState('');
  const [tiebreakSubmitting, setTiebreakSubmitting] = useState(false);
  const [tiebreakSubmitted, setTiebreakSubmitted] = useState(false);
  const [tiebreakError, setTiebreakError] = useState('');
  const [tiebreakRound, setTiebreakRound] = useState(1);
  const [tiebreakHistory, setTiebreakHistory] = useState<TiebreakRoundEntry[]>([]);

  const tiebreakEpochRef = useRef(0);

  const [goodsHistory, setGoodsHistory] = useState<Record<number, HistoryEntry[]>>({});
  const [goodOwnerMap, setGoodOwnerMap] = useState<Record<number, number>>({});
  const [openHistoryPlayerId, setOpenHistoryPlayerId] = useState<number | null>(null);

  const [toast, setToast] = useState<{ message: string; color: 'yellow' | 'orange' | 'red' | 'green' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [generalBonuses, setGeneralBonuses] = useState<GeneralBonus[]>([]);
  const [completedObjectiveIds, setCompletedObjectiveIds] = useState<number[]>([]);
  const [showObjectives, setShowObjectives] = useState(false);
  const [objectivesLoaded, setObjectivesLoaded] = useState(false);

  const autoRevealFiredRef = useRef(false);

  function showToast(message: string, color: 'yellow' | 'orange' | 'red' | 'green' = 'yellow') {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, color });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

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

  const loadObjectives = useCallback(async (playerId: number, force = false) => {
    if (objectivesLoaded && !force) return;
    try {
      const res = await fetch(`/api/games/${code}/objectives?playerId=${playerId}`);
      if (!res.ok) return;
      const data = await res.json();
      const personal: Objective[] = data.personalObjectives ?? [];
      setObjectives(personal);
      setGeneralBonuses(data.generalBonuses ?? []);
      setCompletedObjectiveIds(data.completed ?? []);
      if (personal.length > 0 || force) setObjectivesLoaded(true);
    } catch { /* silenzioso */ }
  }, [code, objectivesLoaded]);

  function handleToggleObjectives() {
    const next = !showObjectives;
    setShowObjectives(next);
    if (next && myPlayer) {
      loadObjectives(myPlayer.id, true);
    }
  }

  // ── Reveal animation: mostra offerte una alla volta dal basso ─────────────
  useEffect(() => {
    if (revealedBids.length === 0) { setVisibleBidCount(0); return; }
    setVisibleBidCount(0);
    // Mostra le offerte una alla volta con stagger 120ms
    const timers: ReturnType<typeof setTimeout>[] = [];
    revealedBids.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleBidCount(i + 1), 120 * (i + 1)));
    });
    return () => timers.forEach(clearTimeout);
  }, [revealedBids]);

  useEffect(() => {
    const session = loadSession(code);
    if (!session?.sessionToken) { router.push(`/lobby/${code}`); return; }
    setSession(session);
    sessionIdRef.current = session.id;

    async function init() {
      const [gameRes, auctionRes, eventsRes] = await Promise.all([
        fetch(`/api/games/${code}`),
        fetch(`/api/games/${code}/auction`),
        fetch(`/api/games/${code}/events/active`),
      ]);
      const gameData = await gameRes.json();
      if (!gameRes.ok) { router.push('/'); return; }
      if (gameData.game?.status === 'finished') { router.push(`/game/${code}/results`); return; }

      const me = gameData.players?.find((p: Player) => p.id === session!.id);
      if (me) setMyPlayer(me);
      setPlayers(gameData.players ?? []);
      setTotalPlayers((gameData.players ?? []).length);
      if (gameData.game?.totalTurns) setLastTotalTurns(gameData.game.totalTurns);
      if (gameData.categories) setCategoriesMap(gameData.categories);

      if (gameData.goods && Array.isArray(gameData.goods)) {
        const map: Record<number, Good> = {};
        for (const g of gameData.goods as Good[]) map[g.id] = g;
        setAllGoodsMap(map);
      }

      if (eventsRes.ok) {
        const evData = await eventsRes.json();
        if (evData.events?.length) setActiveEvents(evData.events);
      }

      if (auctionRes.ok) {
        const aData = await auctionRes.json();
        if (aData.auction) {
          const totalTurns = gameData.game.totalTurns;
          setAuction({
            id: aData.auction.id,
            turn: aData.auction.turn,
            totalTurns,
            status: aData.auction.status,
            good: aData.auction.good,
            isEventTurn: false,
            timerSeconds: 45,
          });
          setLastTurn(aData.auction.turn);
          setLastTotalTurns(totalTurns);
          setPhase(aData.auction.status === 'revealing' ? 'revealing' : 'bidding');
          if (aData.auction.status === 'bidding') startTimer(45);
          if (aData.auction.status === 'revealing' && aData.bids) setRevealedBids(aData.bids);
          const tiedIds: number[] = (aData.auction.tiedPlayerIds ?? []).map(Number);
          setTiedPlayerIds(tiedIds);
          const mnTiebreak = aData.isMNTiebreak ?? false;
          setIsMNTiebreak(mnTiebreak);
          if (aData.auction.status === 'revealing' && tiedIds.length > 0) {
            if (session?.id && tiedIds.includes(Number(session.id))) {
              setShowTiebreakModal(true);
              vibrate('tiebreak-start');
            }
            setResultDetails(mnTiebreak ? 'Spareggio Mercato Nero in corso' : 'Pareggio: spareggio in corso');
          }
        }
      }
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (data.event) {
        setActiveEvents(prev => {
          const alreadyIn = prev.some(e => e.id === data.event!.id);
          if (alreadyIn) return prev;
          return [...prev, data.event!];
        });
        setShowEventsBanner(true);
      }
      setAuction({ id: data.auction.id, turn: data.turn, totalTurns: data.totalTurns, status: 'bidding', good: data.auction.good, isEventTurn: data.isEventTurn, timerSeconds: data.timerSeconds });
      setLastTurn(data.turn); setLastTotalTurns(data.totalTurns);
      setPhase('bidding'); setHasBid(false); setBidAmount(''); setUseMercatoNero(false);
      setBidError(''); setRevealedBids([]); setWinnerId(null); setWinningBid(0);
      setResultDetails(''); setScugnizzuMessage(''); setConfirmedCount(0);
      setBiddingPlayerIds([]);
      setTiedPlayerIds([]); setIsMNTiebreak(false); setShowTiebreakModal(false);
      setTiebreakSubmitted(false); setTiebreakAmount(''); setTiebreakError('');
      setTiebreakRound(1); setTiebreakHistory([]);
      tiebreakEpochRef.current += 1;
      autoRevealFiredRef.current = false;
      startTimer(data.timerSeconds);
      vibrate('auction-start');
      sounds.auctionStart();
    });

    channel.bind('bid-confirmed', (data: { auctionId: number; confirmedCount: number; totalPlayers: number; biddingPlayerIds?: number[] }) => {
      setConfirmedCount(data.confirmedCount);
      setTotalPlayers(data.totalPlayers);
      if (data.biddingPlayerIds) setBiddingPlayerIds(data.biddingPlayerIds);
      sounds.bidIn();
    });

    const handleRevealLikeEvent = (data: {
      auctionId: number;
      bids: (Bid & { playerName: string })[];
      roundBids?: { playerId: number; playerName: string; amount: number; round: number }[];
      tiebreakRound?: number;
      winnerId: number | null;
      winningBid: number;
      details: string;
      tiedPlayerIds?: number[];
      isMNTiebreak?: boolean;
      players: Player[];
      goodId?: number;
      goodName?: string;
      turn?: number;
    }) => {
      stopTimer(); setPhase('revealing');
      setRevealedBids(data.bids); setWinnerId(data.winnerId); setWinningBid(data.winningBid);
      setResultDetails(data.details); setPlayers(data.players);
      setMyPlayer(prev => data.players.find(p => p.id === prev?.id) ?? prev);
      const tiedIds = (data.tiedPlayerIds ?? []).map(Number);
      setTiedPlayerIds(tiedIds);
      const mnTiebreak = data.isMNTiebreak ?? false;
      setIsMNTiebreak(mnTiebreak);
      const myId = sessionIdRef.current ?? loadSession(code)?.id ?? null;

      // Suoni reveal
      const hasMN = data.bids.some(b => b.isMercatoNero);
      if (hasMN) sounds.mercatoNero();
      else sounds.reveal();
      if (data.winnerId) setTimeout(() => sounds.win(), data.bids.length * 120 + 300);

      if (data.winnerId === null && tiedIds.length > 0 && myId !== null && tiedIds.includes(Number(myId))) {
        if (data.roundBids && data.roundBids.length > 0) {
          const completedRound = data.tiebreakRound ?? 1;
          setTiebreakHistory(prev => {
            if (prev.some(e => e.round === completedRound)) return prev;
            return [...prev, {
              round: completedRound,
              bids: data.roundBids!.map(b => ({ playerName: b.playerName, amount: b.amount })),
            }];
          });
        }
        setTiebreakRound((data.tiebreakRound ?? 1) + 1);
        setTiebreakAmount('');
        setTiebreakSubmitted(false);
        setTiebreakError('');
        setTiebreakSubmitting(false);
        tiebreakEpochRef.current += 1;
        setShowTiebreakModal(true);
        vibrate('tiebreak-start');
        sounds.tiebreak();
        const toastMsg = mnTiebreak
          ? '🕵️ Ancora pareggio MN! Nuovo spareggio...'
          : '⚠️ Ancora pareggio! Nuovo spareggio...';
        showToast(toastMsg, 'orange');
      } else {
        setShowTiebreakModal(false);
      }

      if (data.winnerId && data.goodId) {
        setGoodOwnerMap(prev => ({ ...prev, [data.goodId!]: data.winnerId! }));
      }

      if (data.winnerId && data.goodName) {
        setGoodsHistory(prev => {
          const existing = prev[data.winnerId!] ?? [];
          const alreadyIn = existing.some(e => e.turn === data.turn);
          if (alreadyIn) return prev;
          return { ...prev, [data.winnerId!]: [...existing, { goodName: data.goodName!, pricePaid: data.winningBid, turn: data.turn ?? 0 }] };
        });
      }
    };

    channel.bind('bids-revealed', handleRevealLikeEvent);
    channel.bind('tiebreak-resolved', handleRevealLikeEvent);

    channel.bind('auction-closed', (data?: {
      goodId?: number;
      goodName?: string;
      winnerId?: number;
      winningBid?: number;
      turn?: number;
      completedObjectivesByPlayer?: Record<number, number[]>;
    }) => {
      setPhase('waiting'); setAuction(null);

      if (data?.winnerId && data?.goodName) {
        setGoodsHistory(prev => {
          const existing = prev[data.winnerId!] ?? [];
          const alreadyIn = existing.some(e => e.turn === data.turn);
          if (alreadyIn) {
            return { ...prev, [data.winnerId!]: existing.map(e => e.turn === data.turn && !e.goodName ? { ...e, goodName: data.goodName! } : e) };
          }
          return { ...prev, [data.winnerId!]: [...existing, { goodName: data.goodName!, pricePaid: data.winningBid ?? 0, turn: data.turn ?? 0 }] };
        });
      }

      if (data?.completedObjectivesByPlayer) {
        const myId = sessionIdRef.current ?? loadSession(code)?.id ?? null;
        if (myId) {
          const myCompleted = data.completedObjectivesByPlayer[myId];
          if (myCompleted) {
            setCompletedObjectiveIds(prev => {
              const newIds = myCompleted.filter(id => !prev.includes(id));
              if (newIds.length === 0) return prev;
              newIds.forEach(() => { showToast('🏆 Obiettivo completato!', 'green'); sounds.complete(); });
              return [...prev, ...newIds];
            });
          }
        }
      }
    });

    channel.bind('scugnizzu-used', (data: { playerId: number; playerName: string; newCredits: number }) => {
      setPlayers(prev => prev.map(p => p.id === data.playerId ? { ...p, credits: data.newCredits, usedScugnizzu: true } : p));
      setMyPlayer(prev => prev?.id === data.playerId ? { ...prev, credits: data.newCredits, usedScugnizzu: true } : prev);
      showToast(`🧑‍🔧 ${data.playerName} ha usato lo Scugnizzu! (+30 crediti)`, 'orange');
    });

    channel.bind('game-finished', () => router.push(`/game/${code}/results`));

    return () => { channel.unbind_all(); pusher.unsubscribe(`game-${code}`); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // ── Auto-reveal ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'bidding') return;
    if (!myPlayer?.isHost) return;
    if (autoRevealFiredRef.current) return;

    const allIn = confirmedCount > 0 && confirmedCount >= totalPlayers;

    if (allIn) {
      autoRevealFiredRef.current = true;
      const sessionNow = session ?? loadSession(code);
      if (!sessionNow?.sessionToken) return;
      fetch(`/api/games/${code}/auction/reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: myPlayer.id, sessionToken: sessionNow.sessionToken }),
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedCount, totalPlayers, phase, myPlayer?.isHost]);

  async function handleBid() {
    unlockAudio();
    if (!myPlayer || !auction || !session?.sessionToken) return;
    const amount = useMercatoNero ? 0 : parseInt(bidAmount);
    if (!useMercatoNero && (isNaN(amount) || amount < 0)) { setBidError('Inserisci un importo valido'); return; }
    if (!useMercatoNero && amount > myPlayer.credits) { setBidError('Crediti insufficienti'); return; }
    setBidLoading(true); setBidError('');
    const res = await fetch(`/api/games/${code}/auction/bid`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: myPlayer.id, sessionToken: session.sessionToken, amount, isMercatoNero: useMercatoNero }),
    });
    const data = await res.json();
    if (!res.ok) { setBidError(data.error); setBidLoading(false); return; }
    setHasBid(true); setBidLoading(false);
  }

  async function handleReveal() {
    if (!myPlayer?.isHost || !session?.sessionToken) return;
    await fetch(`/api/games/${code}/auction/reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: myPlayer.id, sessionToken: session.sessionToken })
    });
  }

  async function handleClose() {
    if (!myPlayer?.isHost || !session?.sessionToken) return;
    await fetch(`/api/games/${code}/auction/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: myPlayer.id, sessionToken: session.sessionToken })
    });
  }

  async function handleNextAuction() {
    if (!myPlayer?.isHost || !session?.sessionToken) return;
    await fetch(`/api/games/${code}/auction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: myPlayer.id, sessionToken: session.sessionToken })
    });
  }

  async function handleScugnizzu() {
    if (!myPlayer || myPlayer.usedScugnizzu || !session?.sessionToken) return;
    setScugnizzuLoading(true); setScugnizzuMessage('');
    const res = await fetch(`/api/games/${code}/scugnizzu`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: myPlayer.id, sessionToken: session.sessionToken })
    });
    const data = await res.json();
    setScugnizzuMessage(res.ok ? data.message : data.error);
    setScugnizzuLoading(false);
  }

  async function handleSubmitTiebreak() {
    const resolvedSession = session ?? loadSession(code);
    const resolvedPlayer = myPlayer;
    if (!resolvedPlayer || !resolvedSession?.sessionToken) return;

    const amount = parseInt(tiebreakAmount);
    if (isNaN(amount) || amount < 0) { setTiebreakError('Inserisci un importo valido'); return; }
    if (amount > resolvedPlayer.credits) { setTiebreakError('Crediti insufficienti'); return; }

    const epochAtSubmit = tiebreakEpochRef.current;

    setTiebreakSubmitting(true);
    setTiebreakError('');
    const res = await fetch(`/api/games/${code}/auction/tiebreak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: resolvedPlayer.id, sessionToken: resolvedSession.sessionToken, amount }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (tiebreakEpochRef.current === epochAtSubmit) {
        setTiebreakError(data.error ?? 'Errore nello spareggio');
        setTiebreakSubmitting(false);
      }
      return;
    }
    if (tiebreakEpochRef.current !== epochAtSubmit) return;
    setTiebreakSubmitted(true);
    setTiebreakSubmitting(false);
  }

  // ── Derived values ────────────────────────────────────────────────────────────
  const timerColor = timeLeft > 15 ? 'text-green-400' : timeLeft > 5 ? 'text-yellow-400' : 'text-red-400';
  const mercatoNeroWinner = winnerId ? revealedBids.find(b => b.playerId === winnerId && b.isMercatoNero) : null;
  const displayTurn = auction?.turn ?? lastTurn;
  const displayTotalTurns = auction?.totalTurns ?? lastTotalTurns;
  const myBaseCategoryName = myPlayer?.baseCategoryId ? (categoriesMap[myPlayer.baseCategoryId] ?? null) : null;

  // Offerte ordinate: dal più alto al più basso, MN in fondo
  const sortedRevealedBids = [...revealedBids].sort((a, b) => {
    if (a.isMercatoNero && !b.isMercatoNero) return 1;
    if (!a.isMercatoNero && b.isMercatoNero) return -1;
    return b.amount - a.amount;
  });

  // Giocatori che non hanno ancora offerto (AFK per l'host)
  const afkPlayers = phase === 'bidding'
    ? players.filter(p => !biddingPlayerIds.includes(p.id))
    : [];

  const currentGood = auction?.good ?? null;
  const categoryGoods = currentGood
    ? Object.values(allGoodsMap).filter(g => g.categoryId === currentGood.categoryId)
    : [];

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4 flex flex-col gap-4 max-w-lg mx-auto">

      <InjectStyles />
      {toast && <Toast message={toast.message} color={toast.color} />}

      {/* Modal Spareggio */}
      {showTiebreakModal && myPlayer && (
        <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-gray-900 border border-yellow-500 rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-yellow-400">
              {isMNTiebreak ? '⚔️ Spareggio Mercato Nero' : '⚖️ Spareggio'}
              {tiebreakRound > 1 ? ` — Round ${tiebreakRound}` : ''}
            </h3>

            {isMNTiebreak && (
              <p className="text-xs text-red-300 bg-red-900/30 border border-red-700 rounded-lg px-3 py-2">
                🕵️ Più giocatori hanno usato Mercato Nero. Chi vince lo spareggio ottiene il bene pagando
                <strong> max(offerta più alta normale + 1, tua offerta spareggio)</strong>.
                Chi perde <strong>mantiene</strong> il Mercato Nero per i turni futuri.
              </p>
            )}

            {tiebreakHistory.length > 0 && (
              <div className="space-y-2">
                {tiebreakHistory.map(entry => (
                  <div key={entry.round} className="bg-gray-800 rounded-xl px-3 py-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Round {entry.round} — Pareggio a {entry.bids[0]?.amount ?? '?'} cr</p>
                    <ul className="space-y-0.5">
                      {entry.bids.map((b, i) => (
                        <li key={i} className="flex justify-between text-xs">
                          <span className="text-gray-300">{b.playerName}</span>
                          <span className="text-yellow-400 font-bold">{b.amount} cr</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {!tiebreakSubmitted ? (
              <>
                <p className="text-sm text-gray-300">
                  {tiebreakRound > 1
                    ? `Pareggio anche al round ${tiebreakRound - 1}! Inserisci una nuova offerta (max ${myPlayer.credits} crediti).`
                    : `${isMNTiebreak ? 'Sei in spareggio MN.' : 'Sei in pareggio.'} Inserisci la tua offerta di spareggio (max ${myPlayer.credits} crediti).`}
                </p>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min={0}
                  max={myPlayer.credits}
                  value={tiebreakAmount}
                  onChange={e => setTiebreakAmount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmitTiebreak()}
                  className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="La tua offerta"
                  autoFocus
                />
                {tiebreakError && <p className="text-red-400 text-sm">{tiebreakError}</p>}
                <button
                  onClick={handleSubmitTiebreak}
                  disabled={tiebreakSubmitting || !tiebreakAmount}
                  className="w-full bg-yellow-400 text-gray-950 font-bold py-3 rounded-xl hover:bg-yellow-300 disabled:opacity-50 transition"
                >
                  {tiebreakSubmitting ? 'Invio...' : '✅ Conferma spareggio'}
                </button>
              </>
            ) : (
              <p className="text-sm text-gray-300">In attesa degli altri giocatori in spareggio...</p>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🎯 Asta Pazza</h1>
        <span className="font-mono text-yellow-400 tracking-widest">{code}</span>
      </div>

      {/* Crediti, turno e categoria base */}
      <div className="bg-gray-900 rounded-2xl px-4 py-3 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-sm">
            Turno <span className="text-white font-bold">{displayTurn ?? '—'}</span>
            {displayTotalTurns ? <span className="text-gray-500"> / {displayTotalTurns}</span> : null}
          </span>
          <span className="text-sm">
            💰 <span className="font-bold text-yellow-400">{myPlayer?.credits ?? '—'}</span> crediti
          </span>
        </div>
        {myBaseCategoryName && (
          <div className="flex items-center gap-2 pt-1 border-t border-gray-800">
            <span className="text-xs text-gray-400">⭐ Categoria base:</span>
            <span className="text-xs font-bold text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 px-2 py-0.5 rounded-full">
              {myBaseCategoryName}
            </span>
            <span className="text-xs text-gray-500">(+10 pt per ogni bene)</span>
          </div>
        )}
      </div>

      {/* Obiettivi personali */}
      <div className="bg-gray-900 rounded-2xl overflow-hidden">
        <button
          onClick={handleToggleObjectives}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800 transition"
        >
          <span className="text-sm font-semibold text-gray-300">
            🎯 I miei obiettivi
            {completedObjectiveIds.length > 0 && (
              <span className="ml-2 text-green-400 text-xs">✅ {completedObjectiveIds.length} completat{completedObjectiveIds.length === 1 ? 'o' : 'i'}</span>
            )}
          </span>
          <span className="text-gray-500 text-xs">{showObjectives ? '▲ chiudi' : '▼ mostra'}</span>
        </button>

        {showObjectives && (
          <div className="px-4 pb-4 space-y-3">
            {!objectivesLoaded && (
              <p className="text-gray-500 text-xs animate-pulse">Caricamento...</p>
            )}
            {objectivesLoaded && objectives.length === 0 && (
              <p className="text-gray-500 text-xs">Nessun obiettivo assegnato.</p>
            )}
            {objectives.length > 0 && (
              <div className="space-y-2 mt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Obiettivi personali</p>
                {objectives.map(obj => {
                  const isCompleted = completedObjectiveIds.includes(obj.id);
                  return (
                    <div
                      key={obj.id}
                      className={`border rounded-xl px-3 py-2 transition ${
                        isCompleted
                          ? 'border-green-500 bg-green-500/10 opacity-80'
                          : (RARITY_STYLE[obj.rarity] ?? 'border-gray-600 text-gray-300')
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase">
                            {isCompleted ? '✅ Completato' : (RARITY_LABEL[obj.rarity] ?? obj.rarity)}
                          </span>
                          <span className="font-bold text-sm">+{obj.points} pt</span>
                        </div>
                      </div>
                      <p className="font-semibold text-sm mt-0.5">{obj.name}</p>
                      <p className="text-xs opacity-75 mt-0.5">{obj.description}</p>
                    </div>
                  );
                })}
              </div>
            )}
            {generalBonuses.length > 0 && (
              <div className="space-y-2 mt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Bonus generali</p>
                {generalBonuses.map((bonus, i) => (
                  <div key={i} className="border border-gray-600 bg-gray-800 rounded-xl px-3 py-2 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-gray-200">{bonus.name}</span>
                      <span className="font-bold text-sm text-green-400">
                        +{GENERAL_BONUS_POINTS[bonus.id] ?? bonus.points ?? '?'} pt
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">{bonus.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Banner eventi attivi */}
      {activeEvents.length > 0 && (
        <div className="bg-purple-900/60 border border-purple-500 rounded-2xl px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-purple-300 font-bold text-sm uppercase tracking-wide">
              ⚡ {activeEvents.length > 1 ? `${activeEvents.length} Eventi Attivi` : 'Evento Attivo'}
            </p>
            <button onClick={() => setShowEventsBanner(v => !v)} className="text-purple-400 hover:text-white text-xs">
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
            <button onClick={handleScugnizzu} disabled={scugnizzuLoading}
              className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold text-sm px-4 py-2 rounded-xl transition">
              {scugnizzuLoading ? '...' : 'Usa'}
            </button>
          </div>
          {scugnizzuMessage && <p className="text-xs text-orange-300">{scugnizzuMessage}</p>}
        </div>
      )}

      {/* Fase: waiting */}
      {phase === 'waiting' && (
        <div className="bg-gray-900 rounded-2xl p-6 text-center space-y-4">
          <p className="text-gray-400">In attesa del prossimo bene...</p>
          {myPlayer?.isHost && (
            <button onClick={handleNextAuction} className="w-full bg-yellow-400 text-gray-950 font-bold py-3 rounded-xl hover:bg-yellow-300 transition">
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
            {categoriesMap[auction.good.categoryId] && (
              <p className="text-xs text-gray-400">
                Categoria: <span className="text-white font-semibold">{categoriesMap[auction.good.categoryId]}</span>
              </p>
            )}
            {myBaseCategoryName && auction.good.categoryId === myPlayer?.baseCategoryId && (
              <p className="text-yellow-300 text-xs">⭐ Appartiene alla tua categoria base! +10 pt extra</p>
            )}
          </div>

          {/* Card categoria */}
          {categoryGoods.length > 0 && (
            <div className="bg-gray-800 rounded-xl px-3 py-3 space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                📦 Beni della categoria · {categoriesMap[auction.good.categoryId] ?? ''}
              </p>
              <ul className="space-y-1">
                {categoryGoods.map(g => {
                  const ownerId = goodOwnerMap[g.id];
                  const owner = ownerId ? players.find(p => p.id === ownerId) : null;
                  const isCurrentGood = g.id === auction.good.id;
                  const isMyBaseCategory = myPlayer?.baseCategoryId === g.categoryId;
                  return (
                    <li
                      key={g.id}
                      className={`flex items-center justify-between text-xs rounded-lg px-2 py-1.5 ${
                        isCurrentGood
                          ? 'bg-yellow-500/20 border border-yellow-500/50'
                          : 'bg-gray-700/50'
                      }`}
                    >
                      <span className={`font-medium ${
                        isCurrentGood ? 'text-yellow-300' : owner ? 'text-gray-400 line-through' : 'text-gray-200'
                      }`}>
                        {isCurrentGood && <span className="mr-1">🔨</span>}
                        {g.name}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={`font-bold ${
                          isMyBaseCategory ? 'text-yellow-400' : 'text-green-400'
                        }`}>
                          {g.baseValue}{isMyBaseCategory ? '+10' : ''} pt
                        </span>
                        {owner && (
                          <span className="text-gray-400 text-xs">
                            {owner.id === myPlayer?.id ? '(tu)' : owner.name}
                          </span>
                        )}
                        {!owner && !isCurrentGood && (
                          <span className="text-gray-600 text-xs">—</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="text-center">
            <span className={`text-4xl font-mono font-bold ${timerColor}`}>{timeLeft}s</span>
          </div>
          {!hasBid ? (
            <div className="space-y-3">
              {myPlayer && !myPlayer.usedMercatoNero && (
                <button onClick={() => setUseMercatoNero(v => !v)}
                  className={`w-full py-2 rounded-xl text-sm font-medium transition border ${
                    useMercatoNero ? 'bg-red-600 border-red-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-red-500'
                  }`}>
                  {useMercatoNero ? '🔴 Mercato Nero ATTIVO — clicca per annullare' : '🕵️ Usa Mercato Nero'}
                </button>
              )}
              {!useMercatoNero && (
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
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
              <button onClick={handleBid} disabled={bidLoading || (!useMercatoNero && !bidAmount)}
                className="w-full bg-yellow-400 text-gray-950 font-bold py-3 rounded-xl hover:bg-yellow-300 disabled:opacity-50 transition">
                {bidLoading ? 'Invio...' : useMercatoNero ? '🕵️ Dichiara Mercato Nero' : '✅ Conferma Offerta'}
              </button>
            </div>
          ) : (
            <div className="text-center space-y-2">
              <p className="text-green-400 font-semibold">{useMercatoNero ? '🕵️ Mercato Nero dichiarato!' : '✅ Offerta inviata!'}</p>
              <p className="text-gray-400 text-sm">In attesa degli altri giocatori...</p>
            </div>
          )}

          {/* Pannello host */}
          {myPlayer?.isHost && (
            <div className="space-y-2 mt-2">
              <div className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-2">
                <span className="text-gray-400 text-sm">Offerte ricevute</span>
                <span className="font-bold text-white">
                  {confirmedCount} / {totalPlayers}
                  {confirmedCount === totalPlayers && totalPlayers > 0 && <span className="ml-2 text-green-400 text-xs">✓ tutti</span>}
                </span>
              </div>

              {/* AFK panel — giocatori che non hanno ancora offerto */}
              {afkPlayers.length > 0 && (
                <div className="bg-red-950/60 border border-red-700/60 rounded-xl px-3 py-2 space-y-1">
                  <p className="text-red-400 text-xs font-semibold uppercase tracking-wide">⏳ In attesa di...</p>
                  <ul className="space-y-0.5">
                    {afkPlayers.map(p => (
                      <li key={p.id} className="flex items-center gap-2 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                        <span className="text-red-200">{p.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button onClick={handleReveal} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-500 transition">
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
            {categoriesMap[auction.good.categoryId] && (
              <p className="text-xs text-gray-500">
                Categoria: <span className="text-gray-300 font-medium">{categoriesMap[auction.good.categoryId]}</span>
              </p>
            )}
          </div>

          {/* Offerte animate dal basso verso l'alto */}
          <div className="space-y-1">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Offerte</p>
            <ul className="space-y-2">
              {sortedRevealedBids.map((bid, idx) => {
                const isVisible = idx < visibleBidCount;
                if (!isVisible) return null;
                const isMN = bid.isMercatoNero;
                return (
                  <li
                    key={bid.playerId}
                    className={`flex items-center justify-between bg-gray-800 rounded-xl px-4 py-2 ${
                      bid.playerId === winnerId
                        ? (mercatoNeroWinner && isMN ? 'border border-red-500' : 'border border-yellow-400')
                        : ''
                    } ${ isMN ? 'bid-mn-shake' : 'bid-slide-up' }`}
                    style={{ animationDelay: `${idx * 120}ms` }}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      {!isMN && (
                        <span className={`text-xs font-bold w-5 text-center rounded-full ${
                          idx === 0 ? 'text-yellow-400' : 'text-gray-600'
                        }`}>
                          {idx + 1}.
                        </span>
                      )}
                      {isMN && <span className="text-red-400">🕵️</span>}
                      <span>{bid.playerName}</span>
                      {isMN && <span className="text-red-400 text-xs">(MN)</span>}
                    </span>
                    <span className="font-bold">{isMN ? '—' : `${bid.amount} cr`}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Risultato — appare solo dopo che tutte le offerte sono visibili */}
          {visibleBidCount >= sortedRevealedBids.length && (
            <>
              {winnerId ? (
                <div className={`border rounded-xl px-4 py-3 text-center bid-slide-up ${
                  mercatoNeroWinner ? 'bg-red-900/40 border-red-500' : 'bg-yellow-400/10 border-yellow-400'
                }`}>
                  {mercatoNeroWinner && <p className="text-red-400 text-xs font-bold uppercase tracking-widest mb-1">🕵️ Vinto con Mercato Nero</p>}
                  <p className={`font-bold text-lg ${mercatoNeroWinner ? 'text-red-300' : 'text-yellow-400'}`}>
                    🏆 {players.find(p => p.id === winnerId)?.name ?? 'Vincitore'}
                  </p>
                  <p className="text-gray-300 text-sm">ha vinto pagando <span className="font-bold text-white">{winningBid} crediti</span></p>
                </div>
              ) : (
                <div className="bg-gray-800 rounded-xl px-4 py-3 text-center bid-slide-up">
                  <p className="text-gray-400">🤝 {resultDetails}</p>
                </div>
              )}
            </>
          )}

          {myPlayer?.isHost && tiedPlayerIds.length === 0 && visibleBidCount >= sortedRevealedBids.length && (
            <button onClick={handleClose} className="w-full bg-green-500 text-white font-bold py-3 rounded-xl hover:bg-green-400 transition bid-slide-up">
              ➡️ Prossimo bene
            </button>
          )}
          {winnerId === null && tiedPlayerIds.length > 0 && !tiedPlayerIds.includes(myPlayer?.id ?? -1) && (
            <p className="text-center text-gray-400 text-sm">
              {isMNTiebreak ? '🕵️ Spareggio Mercato Nero in corso...' : '⚖️ Spareggio in corso tra i giocatori in pareggio...'}
            </p>
          )}
          {!myPlayer?.isHost && tiedPlayerIds.length === 0 && <p className="text-center text-gray-500 text-sm">In attesa che l&apos;host continui...</p>}
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
