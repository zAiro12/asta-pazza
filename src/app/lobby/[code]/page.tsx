'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getPusherClient } from '@/lib/pusher-client';

interface Player {
  id: number;
  name: string;
  isHost: boolean;
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

  const autoJoinCalled = useRef(false);

  useEffect(() => {
    const nameFromUrl = searchParams.get('name');
    if (nameFromUrl && !autoJoinCalled.current) {
      autoJoinCalled.current = true;
      joinGame(nameFromUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!joined) return;

    const pusher = getPusherClient();
    const channel = pusher.subscribe(`game-${code}`);

    channel.bind('player-joined', (data: { players: Player[] }) => {
      setPlayers(data.players);
    });
    channel.bind('player-left', (data: { players: Player[] }) => {
      setPlayers(data.players);
    });
    channel.bind('game-started', () => {
      router.push(`/game/${code}`);
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`game-${code}`);
    };
  }, [joined, code, router]);

  async function joinGame(name: string) {
    setLoading(true);
    setError('');

    const res = await fetch('/api/lobby/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, playerName: name.trim() }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      setLoading(false);
      return;
    }

    setMyPlayer(data.player);
    setPlayers(data.allPlayers);
    setJoined(true);
    setLoading(false);
  }

  async function handleJoin() {
    if (!playerName.trim()) return;
    await joinGame(playerName);
  }

    async function handleStart() {
    await fetch('/api/lobby/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
  }

  async function handleShare() {
    const url = `${window.location.origin}/lobby/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Copia questo link:', url);
    }
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
      <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Lobby</h1>
          <span className="font-mono text-yellow-400 text-xl tracking-widest">{code}</span>
        </div>

        <button
          onClick={handleShare}
          className="w-full bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl transition mb-6 flex items-center justify-center gap-2 text-sm font-medium"
        >
          {copied ? '✅ Link copiato!' : '🔗 Condividi link sala'}
        </button>

        <p className="text-gray-400 text-sm mb-4">
          {players.length} giocatore{players.length !== 1 ? 'i' : ''} connesso{players.length !== 1 ? 'i' : ''}
        </p>

        <ul className="space-y-2 mb-8">
          {players.map((p) => (
            <li key={p.id} className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3">
              <span className="w-2 h-2 rounded-full bg-green-400"></span>
              <span className="font-medium">{p.name}</span>
              {p.isHost && <span className="ml-auto text-xs text-yellow-400 font-semibold">HOST</span>}
              {p.id === myPlayer?.id && !p.isHost && <span className="ml-auto text-xs text-gray-400">(tu)</span>}
            </li>
          ))}
        </ul>

        {myPlayer?.isHost && (
          <button
            onClick={handleStart}
            disabled={players.length < 2}
            className="w-full bg-green-500 text-white font-bold py-3 rounded-xl hover:bg-green-400 disabled:opacity-50 transition"
          >
            {players.length < 2 ? 'Aspetta almeno 2 giocatori' : '🎯 Avvia Partita'}
          </button>
        )}

        {!myPlayer?.isHost && (
          <p className="text-center text-gray-500 text-sm">In attesa che l’host avvii la partita...</p>
        )}
      </div>
    </main>
  );
}
