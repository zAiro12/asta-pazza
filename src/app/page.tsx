'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [view, setView] = useState<'home' | 'create' | 'join'>('home');
  const [hostName, setHostName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!hostName.trim()) return;
    setLoading(true);
    setError('');

    const res = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostName: hostName.trim() }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      setLoading(false);
      return;
    }

    // Salva sessione in localStorage prima del redirect
    const code = data.game.code;
    localStorage.setItem(`asta-player-${code}`, JSON.stringify(data.player));

    router.push(`/lobby/${code}`);
  }

  async function handleJoin() {
    if (!joinCode.trim()) return;
    router.push(`/lobby/${joinCode.trim().toUpperCase()}`);
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-8 p-4 bg-gray-950 text-white">
      <div className="text-center">
        <h1 className="text-6xl font-black text-amber-400 mb-2">🃏 Asta Pazza</h1>
        <p className="text-slate-400 text-lg">Gioco di aste al buio in tempo reale</p>
      </div>

      {view === 'home' && (
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button
            className="bg-yellow-400 text-gray-950 font-bold text-lg py-4 rounded-xl hover:bg-yellow-300 transition"
            onClick={() => { setView('create'); setError(''); }}
          >
            🎮 Crea Partita
          </button>
          <button
            className="bg-gray-800 text-white font-bold text-lg py-4 rounded-xl hover:bg-gray-700 transition"
            onClick={() => { setView('join'); setError(''); }}
          >
            🔗 Unisciti a una Partita
          </button>
        </div>
      )}

      {view === 'create' && (
        <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-sm shadow-xl">
          <h2 className="text-xl font-bold mb-6">Nuova Partita</h2>

          <input
            type="text"
            placeholder="Il tuo nome (host)"
            value={hostName}
            onChange={e => setHostName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 mb-4 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            maxLength={20}
          />

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={loading || !hostName.trim()}
            className="w-full bg-yellow-400 text-gray-950 font-bold py-3 rounded-xl hover:bg-yellow-300 disabled:opacity-50 transition mb-3"
          >
            {loading ? 'Creando...' : '🚀 Crea e Entra'}
          </button>
          <button
            className="w-full bg-gray-800 text-white py-3 rounded-xl hover:bg-gray-700 transition"
            onClick={() => setView('home')}
          >
            ← Indietro
          </button>
        </div>
      )}

      {view === 'join' && (
        <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-sm shadow-xl">
          <h2 className="text-xl font-bold mb-6">Unisciti a una Partita</h2>

          <input
            type="text"
            placeholder="Codice sala (es. XKQZ)"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 mb-4 focus:outline-none focus:ring-2 focus:ring-yellow-400 font-mono tracking-widest"
            maxLength={6}
          />

          <button
            onClick={handleJoin}
            disabled={!joinCode.trim()}
            className="w-full bg-yellow-400 text-gray-950 font-bold py-3 rounded-xl hover:bg-yellow-300 disabled:opacity-50 transition mb-3"
          >
            Entra
          </button>
          <button
            className="w-full bg-gray-800 text-white py-3 rounded-xl hover:bg-gray-700 transition"
            onClick={() => setView('home')}
          >
            ← Indietro
          </button>
        </div>
      )}

      <footer className="absolute bottom-4 w-full text-center text-xs text-slate-600 space-y-0.5">
        <p>
          © {new Date().getFullYear()} Asta Pazza —{' '}
          <a
            href="https://lucaairo.it"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-amber-400 transition"
          >
            zAiro
          </a>
        </p>
        <p className="text-slate-700">v{process.env.NEXT_PUBLIC_APP_VERSION}</p>
      </footer>
    </main>
  );
}
