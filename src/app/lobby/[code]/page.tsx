'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getPusherClient } from '@/lib/pusher-client';

interface Player {
  id: number;
  name: string;
  isHost: boolean;
}

interface Category {
  id: number;
  name: string;
  itemCount: number;
}

function getSessionKey(code: string) {
  return `asta-player-${code}`;
}
function saveSession(code: string, player: Player) {
  localStorage.setItem(getSessionKey(code), JSON.stringify(player));
}
function loadSession(code: string): Player | null {
  try {
    const raw = localStorage.getItem(getSessionKey(code));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function clearSession(code: string) {
  localStorage.removeItem(getSessionKey(code));
}

export default function LobbyPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = (params.code as string).toUpperCase();

  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayer, setMyPlayer] = useState<Player | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true); // parte true: stiamo verificando la sala
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [gameNotFound, setGameNotFound] = useState(false);

  // Categorie
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [totalTurns, setTotalTurns] = useState<number>(0);

  const autoJoinCalled = useRef(false);

  // Beni selezionati live
  const liveItemCount = allCategories
    .filter(c => selectedCategoryIds.includes(c.id))
    .reduce((acc, c) => acc + c.itemCount, 0);

  // Carica categorie con itemCount; seleziona tutto di default
  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then((data: Category[]) => {
        setAllCategories(data);
        setSelectedCategoryIds(prev =>
          prev.length === 0 ? data.map(c => c.id) : prev
        );
      })
      .catch(() => {});
  }, []);

  // Carica categorie già salvate per questa partita (rejoin)
  useEffect(() => {
    if (!joined) return;
    fetch(`/api/games/${code}/categories`)
      .then(r => r.json())
      .then(data => {
        if (data.selectedCategories?.length > 0) {
          setSelectedCategoryIds(data.selectedCategories.map((c: Category) => c.id));
          setTotalTurns(data.totalTurns ?? 0);
        }
      })
      .catch(() => {});
  }, [joined, code]);

  // Verifica esistenza sala + eventuale auto-join
  useEffect(() => {
    if (autoJoinCalled.current) return;

    async function init() {
      // Controlla se la sala esiste
      const res = await fetch(`/api/games/${code}`);
      if (!res.ok) {
        setGameNotFound(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (!data.game) {
        setGameNotFound(true);
        setLoading(false);
        return;
      }
      if (data.game.status === 'active') {
        // Partita già iniziata
        const session = loadSession(code);
        if (session) { router.push(`/game/${code}`); return; }
        setGameNotFound(true); // non puoi entrare a partita avviata
        setLoading(false);
        return;
      }

      // Sala valida in lobby
      const session = loadSession(code);
      if (session) {
        autoJoinCalled.current = true;
        await rejoinGame(session);
        return;
      }
      const nameFromUrl = searchParams.get('name');
      if (nameFromUrl) {
        autoJoinCalled.current = true;
        await joinGame(nameFromUrl);
        return;
      }

      // Nessun auto-join: mostra il form
      setLoading(false);
    }

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!joined) return;
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`game-${code}`);

    channel.bind('player-joined', (data: { players: Player[] }) => setPlayers(data.players));
    channel.bind('player-left', (data: { players: Player[] }) => {
      setPlayers(data.players);
      setMyPlayer(prev => {
        if (!prev) return prev;
        const updated = data.players.find(p => p.id === prev.id);
        if (updated) saveSession(code, updated);
        return updated ?? prev;
      });
    });
    channel.bind('game-started', () => router.push(`/game/${code}`));
    channel.bind('game-deleted', () => { clearSession(code); router.push('/'); });
    channel.bind('categories-selected', (data: { selectedCategoryIds: number[]; totalTurns: number }) => {
      setSelectedCategoryIds(data.selectedCategoryIds);
      setTotalTurns(data.totalTurns);
    });

    return () => { channel.unbind_all(); pusher.unsubscribe(`game-${code}`); };
  }, [joined, code, router]);

  async function rejoinGame(session: Player) {
    setLoading(true);
    const res = await fetch(`/api/games/${code}`);
    const data = await res.json();

    if (!res.ok || data.game?.status !== 'lobby') {
      if (data.game?.status === 'active') { router.push(`/game/${code}`); return; }
      clearSession(code);
      setLoading(false);
      return;
    }

    const stillIn = data.players?.find((p: Player) => p.id === session.id);
    if (!stillIn) { clearSession(code); setLoading(false); return; }

    setMyPlayer(stillIn);
    setPlayers(data.players);
    setJoined(true);
    setLoading(false);
  }

  async function joinGame(name: string) {
    setLoading(true);
    setError('');

    const res = await fetch(`/api/games/${code}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName: name.trim() }),
    });

    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }

    saveSession(code, data.player);
    setMyPlayer(data.player);
    setPlayers(data.allPlayers);
    setJoined(true);
    setLoading(false);
  }

  async function handleJoin() {
    if (!playerName.trim()) return;
    await joinGame(playerName);
  }

  async function handleLeave() {
    if (!myPlayer) return;
    clearSession(code);
    await fetch(`/api/games/${code}/players/${myPlayer.id}`, { method: 'DELETE' });
    router.push('/');
  }

  async function handleStart() {
    if (!myPlayer?.isHost) return;
    if (selectedCategoryIds.length === 0) {
      alert('Seleziona almeno una categoria prima di avviare la partita!');
      return;
    }
    const resCat = await fetch(`/api/games/${code}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: myPlayer.id, selectedCategoryIds }),
    });
    if (!resCat.ok) {
      const d = await resCat.json();
      alert(d.error ?? 'Errore nel salvare le categorie');
      return;
    }
    await fetch(`/api/games/${code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
  }

  function toggleCategory(id: number) {
    if (!myPlayer?.isHost) return;
    setSelectedCategoryIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleShare() {
    const url = `${window.location.origin}/lobby/${code}`;
    const shareData = { title: 'Asta Pazza', text: `Unisciti alla mia partita! Codice sala: ${code}`, url };
    if (navigator.share && navigator.canShare(shareData)) {
      try { await navigator.share(shareData); } catch { /* annullato */ }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch { prompt('Copia questo link:', url); }
    }
  }

  // --- Schermate ---

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Caricamento...</p>
      </main>
    );
  }

  if (gameNotFound) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-md shadow-xl text-center space-y-4">
          <p className="text-5xl">❌</p>
          <h1 className="text-2xl font-bold">Sala non trovata</h1>
          <p className="text-gray-400 text-sm">
            Il codice <span className="font-mono text-yellow-400">{code}</span> non corrisponde a nessuna partita attiva.
          </p>
          <button
            onClick={() => router.push('/')}
            className="w-full bg-yellow-400 text-gray-950 font-bold py-3 rounded-xl hover:bg-yellow-300 transition"
          >
            Torna alla home
          </button>
        </div>
      </main>
    );
  }

  if (!joined) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-md shadow-xl">
          <h1 className="text-2xl font-bold mb-2">Unisciti alla partita</h1>
          <p className="text-gray-400 mb-6">Codice sala: <span className="font-mono text-yellow-400 text-lg">{code}</span></p>
          <input
            type="text"
            placeholder="Il tuo nome"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 mb-4 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            maxLength={20}
            autoFocus
          />
          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          <button
            onClick={handleJoin}
            disabled={loading || !playerName.trim()}
            className="w-full bg-yellow-400 text-gray-950 font-bold py-3 rounded-xl hover:bg-yellow-300 disabled:opacity-50 transition"
          >
            {loading ? 'Entrando...' : 'Entra'}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-md shadow-xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Lobby</h1>
          <span className="font-mono text-yellow-400 text-xl tracking-widest">{code}</span>
        </div>

        {/* Azioni rapide */}
        <div className="space-y-2">
          <button onClick={handleShare} className="w-full bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm font-medium">
            {copied ? '✅ Link copiato!' : '🔗 Condividi link sala'}
          </button>
          <button onClick={handleLeave} className="w-full bg-transparent border border-red-500 text-red-400 hover:bg-red-500 hover:text-white py-2 rounded-xl transition text-sm font-medium">
            🚪 Esci dalla sala
          </button>
        </div>

        {/* Giocatori */}
        <div>
          <p className="text-gray-400 text-sm mb-3">
            {players.length} giocatore{players.length !== 1 ? 'i' : ''} connesso{players.length !== 1 ? 'i' : ''}
          </p>
          <ul className="space-y-2">
            {players.map((p) => (
              <li key={p.id} className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3">
                <span className="w-2 h-2 rounded-full bg-green-400"></span>
                <span className="font-medium">{p.name}</span>
                {p.isHost && <span className="ml-auto text-xs text-yellow-400 font-semibold">HOST</span>}
                {p.id === myPlayer?.id && !p.isHost && <span className="ml-auto text-xs text-gray-400">(tu)</span>}
              </li>
            ))}
          </ul>
        </div>

        {/* Selezione categorie — solo host */}
        {myPlayer?.isHost && (
          <div className="bg-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-gray-300">🗂 Categorie di gioco</h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
                {liveItemCount} beni · {selectedCategoryIds.length} cat.
              </span>
            </div>

            {allCategories.length === 0 ? (
              <p className="text-gray-500 text-xs">Caricamento categorie...</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {allCategories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition border ${
                      selectedCategoryIds.includes(cat.id)
                        ? 'bg-yellow-400 text-gray-950 border-yellow-400'
                        : 'bg-gray-700 text-gray-300 border-gray-600 hover:border-yellow-400'
                    }`}
                  >
                    <span className="block truncate">{selectedCategoryIds.includes(cat.id) ? '✓ ' : ''}{cat.name}</span>
                    <span className="block text-xs opacity-60 mt-0.5">{cat.itemCount} beni</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Info per i non-host */}
        {!myPlayer?.isHost && totalTurns > 0 && (
          <div className="bg-gray-800 rounded-xl px-4 py-3 text-sm text-gray-400">
            🗂 Categorie configurate · <span className="text-white font-medium">{totalTurns} beni in gioco</span>
          </div>
        )}

        {/* Avvia / attendi */}
        {myPlayer?.isHost ? (
          <button
            onClick={handleStart}
            disabled={players.length < 2 || selectedCategoryIds.length === 0}
            className="w-full bg-green-500 text-white font-bold py-3 rounded-xl hover:bg-green-400 disabled:opacity-50 transition"
          >
            {players.length < 2
              ? 'Aspetta almeno 2 giocatori'
              : selectedCategoryIds.length === 0
              ? 'Seleziona almeno una categoria'
              : `🎯 Avvia Partita · ${liveItemCount} beni`}
          </button>
        ) : (
          <p className="text-center text-gray-500 text-sm">In attesa che l&apos;host avvii la partita...</p>
        )}

      </div>
    </main>
  );
}
