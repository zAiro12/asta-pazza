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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Categorie
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [totalTurns, setTotalTurns] = useState<number>(0);
  const [savingCategories, setSavingCategories] = useState(false);
  const [categoriesSaved, setCategoriesSaved] = useState(false);

  const autoJoinCalled = useRef(false);

  // Beni selezionati live (calcolato client-side)
  const liveItemCount = allCategories
    .filter(c => selectedCategoryIds.includes(c.id))
    .reduce((acc, c) => acc + c.itemCount, 0);

  // Carica tutte le categorie con itemCount; seleziona tutto di default
  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then((data: Category[]) => {
        setAllCategories(data);
        // Seleziona tutte di default (solo se non ci sono ancora categorie salvate)
        setSelectedCategoryIds(prev =>
          prev.length === 0 ? data.map(c => c.id) : prev
        );
      })
      .catch(() => {});
  }, []);

  // Carica categorie gia salvate per questa partita (rejoin)
  useEffect(() => {
    if (!joined) return;
    fetch(`/api/games/${code}/categories`)
      .then(r => r.json())
      .then(data => {
        if (data.selectedCategories?.length > 0) {
          setSelectedCategoryIds(data.selectedCategories.map((c: Category) => c.id));
          setTotalTurns(data.totalTurns ?? 0);
          setCategoriesSaved(true);
        }
      })
      .catch(() => {});
  }, [joined, code]);

  useEffect(() => {
    if (autoJoinCalled.current) return;
    const session = loadSession(code);
    if (session) {
      autoJoinCalled.current = true;
      rejoinGame(session);
      return;
    }
    const nameFromUrl = searchParams.get('name');
    if (nameFromUrl) {
      autoJoinCalled.current = true;
      joinGame(nameFromUrl);
    }
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
      setCategoriesSaved(true);
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
    if (selectedCategoryIds.length === 0) {
      alert('Seleziona almeno una categoria prima di avviare la partita!');
      return;
    }
    await fetch(`/api/games/${code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
  }

  async function handleSaveCategories() {
    if (!myPlayer?.isHost) return;
    if (selectedCategoryIds.length === 0) {
      alert('Seleziona almeno una categoria!');
      return;
    }
    setSavingCategories(true);
    const res = await fetch(`/api/games/${code}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: myPlayer.id, selectedCategoryIds }),
    });
    const data = await res.json();
    setSavingCategories(false);
    if (!res.ok) {
      alert(data.error ?? 'Errore nel salvare le categorie');
      return;
    }
    setTotalTurns(data.totalTurns);
    setCategoriesSaved(true);
  }

  function toggleCategory(id: number) {
    if (!myPlayer?.isHost) return;
    setSelectedCategoryIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
    setCategoriesSaved(false);
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

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Caricamento...</p>
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
            {copied ? '\u2705 Link copiato!' : '\ud83d\udd17 Condividi link sala'}
          </button>
          <button onClick={handleLeave} className="w-full bg-transparent border border-red-500 text-red-400 hover:bg-red-500 hover:text-white py-2 rounded-xl transition text-sm font-medium">
            \ud83d\udeaa Esci dalla sala
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

        {/* Selezione categorie - visibile solo all host */}
        {myPlayer?.isHost && (
          <div className="bg-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-gray-300">\ud83d\uddc2 Categorie di gioco</h2>
              {/* Contatore live beni selezionati */}
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                categoriesSaved
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                {liveItemCount} beni{categoriesSaved ? ' \u2713' : ''}
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
                    <span className="block truncate">{selectedCategoryIds.includes(cat.id) ? '\u2713 ' : ''}{cat.name}</span>
                    <span className="block text-xs opacity-60 mt-0.5">{cat.itemCount} beni</span>
                  </button>
                ))}
              </div>
            )}

            {/* Bottone conferma */}
            <button
              onClick={handleSaveCategories}
              disabled={savingCategories || selectedCategoryIds.length === 0}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm transition"
            >
              {savingCategories
                ? 'Salvataggio...'
                : categoriesSaved
                ? `\u2705 Confermati (${liveItemCount} beni \u00b7 ${selectedCategoryIds.length} cat.) \u2014 riconferma per modificare`
                : `\ud83d\udcbe Conferma ${selectedCategoryIds.length} categorie \u00b7 ${liveItemCount} beni`}
            </button>
          </div>
        )}

        {/* Info per i non-host */}
        {!myPlayer?.isHost && categoriesSaved && totalTurns > 0 && (
          <div className="bg-gray-800 rounded-xl px-4 py-3 text-sm text-gray-400">
            \ud83d\uddc2 Categorie configurate \u00b7 <span className="text-white font-medium">{totalTurns} beni in gioco</span>
          </div>
        )}

        {/* Avvia / attendi */}
        {myPlayer?.isHost ? (
          <button
            onClick={handleStart}
            disabled={players.length < 2 || selectedCategoryIds.length === 0 || !categoriesSaved}
            className="w-full bg-green-500 text-white font-bold py-3 rounded-xl hover:bg-green-400 disabled:opacity-50 transition"
          >
            {players.length < 2
              ? 'Aspetta almeno 2 giocatori'
              : selectedCategoryIds.length === 0 || !categoriesSaved
              ? 'Seleziona e conferma le categorie'
              : '\ud83c\udfaf Avvia Partita'}
          </button>
        ) : (
          <p className="text-center text-gray-500 text-sm">In attesa che l\'host avvii la partita...</p>
        )}

      </div>
    </main>
  );
}
