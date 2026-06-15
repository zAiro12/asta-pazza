'use client';

import { useState } from 'react';

export default function Home() {
  const [view, setView] = useState<'home' | 'create' | 'join'>('home');

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-8 p-4">
      <div className="text-center">
        <h1 className="text-6xl font-black text-amber-400 mb-2">🃏 Asta Pazza</h1>
        <p className="text-slate-400 text-lg">Gioco di aste al buio in tempo reale</p>
      </div>

      {view === 'home' && (
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button className="btn-primary text-lg py-4" onClick={() => setView('create')}>
            🎮 Crea Partita
          </button>
          <button className="btn-secondary text-lg py-4" onClick={() => setView('join')}>
            🔗 Unisciti a una Partita
          </button>
        </div>
      )}

      {view === 'create' && (
        <div className="card w-full max-w-sm">
          <h2 className="text-xl font-bold mb-4">Nuova Partita</h2>
          <p className="text-slate-400 text-sm">Configurazione partita — in sviluppo</p>
          <button className="btn-secondary mt-4 w-full" onClick={() => setView('home')}>
            ← Indietro
          </button>
        </div>
      )}

      {view === 'join' && (
        <div className="card w-full max-w-sm">
          <h2 className="text-xl font-bold mb-4">Unisciti</h2>
          <p className="text-slate-400 text-sm">Inserisci codice sala — in sviluppo</p>
          <button className="btn-secondary mt-4 w-full" onClick={() => setView('home')}>
            ← Indietro
          </button>
        </div>
      )}
    </main>
  );
}
