'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Good {
  id: number;
  name: string;
  baseValue: number;
  categoryId: number;
  categoryName: string;
  pricePaid: number;
  hasBaseBonus: boolean;
}

interface Objective {
  id: number;
  name: string;
  points: number;
}

interface Score {
  goods: number;
  baseCategoryBonus: number;
  eventModifiers: number;
  miniCollections: number;
  completeCollections: number;
  majorityBonus: number;
  objectives: number;
  credits: number;
  scugnizzuPenalty: number;
  total: number;
}

interface PlayerResult {
  player: { id: number; name: string; credits: number; usedScugnizzu: boolean };
  goods: Good[];
  objectives: Objective[];
  score: Score;
}

// Mappa categoria → colori Tailwind (bg + testo)
const CATEGORY_COLORS: Record<string, string> = {
  'Auto':             'bg-red-500/20 text-red-300',
  'Immobili':         'bg-orange-500/20 text-orange-300',
  'Tecnologia':       'bg-cyan-500/20 text-cyan-300',
  'Trasporti':        'bg-sky-500/20 text-sky-300',
  'Lusso':            'bg-yellow-500/20 text-yellow-300',
  'Imprese':          'bg-amber-500/20 text-amber-300',
  'Sport':            'bg-green-500/20 text-green-300',
  'Intrattenimento':  'bg-pink-500/20 text-pink-300',
  'Energia':          'bg-lime-500/20 text-lime-300',
  'Potere':           'bg-purple-500/20 text-purple-300',
  'Scienza':          'bg-indigo-500/20 text-indigo-300',
  'Turismo':          'bg-teal-500/20 text-teal-300',
  'Animali':          'bg-emerald-500/20 text-emerald-300',
  'Università':       'bg-blue-500/20 text-blue-300',
  'Quadri':           'bg-rose-500/20 text-rose-300',
};

function CategoryBadge({ name }: { name: string }) {
  const colorClass = CATEGORY_COLORS[name] ?? 'bg-gray-500/20 text-gray-300';
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 ${colorClass}`}>
      {name}
    </span>
  );
}

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();

  const [results, setResults] = useState<PlayerResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/games/${code}/results`);
      if (!res.ok) { setError('Errore nel caricamento dei risultati'); setLoading(false); return; }
      const data = await res.json();
      setResults(data.results ?? []);
      setLoading(false);
    }
    load();
  }, [code]);

  const medals = ['🥇', '🥈', '🥉'];

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Caricamento risultati...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4">
        <p className="text-red-400">{error}</p>
        <button onClick={() => router.push('/')} className="text-yellow-400 underline">Torna alla home</button>
      </main>
    );
  }

  const winner = results[0];

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4 flex flex-col gap-6 max-w-lg mx-auto pb-10">

      {/* Header */}
      <div className="text-center space-y-1 pt-4">
        <h1 className="text-3xl font-bold">🏁 Fine Partita!</h1>
        <p className="text-gray-400 font-mono tracking-widest">{code}</p>
      </div>

      {/* Vincitore */}
      {winner && (
        <div className="bg-yellow-400/10 border-2 border-yellow-400 rounded-2xl p-6 text-center space-y-1">
          <p className="text-4xl">🏆</p>
          <p className="text-2xl font-bold text-yellow-400">{winner.player.name}</p>
          <p className="text-gray-300 text-lg">{winner.score.total} punti</p>
        </div>
      )}

      {/* Classifica */}
      <div className="space-y-3">
        <h2 className="text-gray-400 text-sm font-semibold uppercase tracking-wide">Classifica</h2>
        {results.map((r, i) => (
          <div key={r.player.id} className="bg-gray-900 rounded-2xl overflow-hidden">

            {/* Riga principale */}
            <button
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition text-left"
              onClick={() => setExpanded(expanded === r.player.id ? null : r.player.id)}
            >
              <span className="text-2xl w-8">{medals[i] ?? `#${i + 1}`}</span>
              <div className="flex-1">
                <p className="font-bold">
                  {r.player.name}
                  {r.player.usedScugnizzu && <span className="text-orange-400 ml-2 text-xs">(Scugnizzu)</span>}
                </p>
                <p className="text-gray-400 text-xs">{r.goods.length} beni • {r.player.credits} cr rimasti</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-yellow-400">{r.score.total}</p>
                <p className="text-gray-500 text-xs">punti</p>
              </div>
              <span className="text-gray-500 text-xs ml-1">{expanded === r.player.id ? '▲' : '▼'}</span>
            </button>

            {/* Dettaglio espandibile */}
            {expanded === r.player.id && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-800 pt-3">

                {/* Breakdown punteggio */}
                <div className="bg-gray-800 rounded-xl p-3 space-y-1 text-sm">
                  <p className="text-gray-400 font-medium mb-2">Breakdown punti</p>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Beni</span>
                    <span className="font-bold">{r.score.goods}</span>
                  </div>
                  {r.score.baseCategoryBonus > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-300">Bonus categoria base</span>
                      <span className="font-bold text-yellow-400">+{r.score.baseCategoryBonus}</span>
                    </div>
                  )}
                  {r.score.miniCollections > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-300">Mini-Collezioni</span>
                      <span className="font-bold text-green-400">+{r.score.miniCollections}</span>
                    </div>
                  )}
                  {r.score.completeCollections > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-300">Collezioni Complete</span>
                      <span className="font-bold text-green-400">+{r.score.completeCollections}</span>
                    </div>
                  )}
                  {r.score.majorityBonus > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-300">Bonus Maggioranza</span>
                      <span className="font-bold text-green-400">+{r.score.majorityBonus}</span>
                    </div>
                  )}
                  {r.score.objectives > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-300">Obiettivi</span>
                      <span className="font-bold text-blue-400">+{r.score.objectives}</span>
                    </div>
                  )}
                  {r.score.eventModifiers !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-300">Modificatori eventi</span>
                      <span className={`font-bold ${r.score.eventModifiers >= 0 ? 'text-purple-400' : 'text-red-400'}`}>
                        {r.score.eventModifiers >= 0 ? '+' : ''}{r.score.eventModifiers}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-300">Crediti residui</span>
                    <span className="font-bold">+{r.score.credits}</span>
                  </div>
                  {r.score.scugnizzuPenalty < 0 && (
                    <div className="flex justify-between">
                      <span className="text-orange-400">Penalità Scugnizzu</span>
                      <span className="font-bold text-red-400">{r.score.scugnizzuPenalty}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-gray-700 pt-1 mt-1">
                    <span className="font-bold">Totale</span>
                    <span className="font-bold text-yellow-400">{r.score.total}</span>
                  </div>
                </div>

                {/* Lista beni */}
                {r.goods.length > 0 && (
                  <div>
                    <p className="text-gray-400 text-xs font-medium mb-1">Beni acquistati</p>
                    <ul className="space-y-1">
                      {r.goods.map(g => (
                        <li key={g.id} className="flex items-center justify-between text-sm bg-gray-800 rounded-lg px-3 py-2">
                          <div className="flex flex-col">
                            <span className="text-gray-300">
                              {g.hasBaseBonus && <span className="text-yellow-400 mr-1">★</span>}
                              {g.name}
                            </span>
                            {g.categoryName && <CategoryBadge name={g.categoryName} />}
                          </div>
                          <span className="text-gray-500 ml-2 shrink-0">{g.baseValue}{g.hasBaseBonus ? '+10' : ''} pt</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Obiettivi completati */}
                {r.objectives.length > 0 && (
                  <div>
                    <p className="text-gray-400 text-xs font-medium mb-1">Obiettivi</p>
                    <ul className="space-y-1">
                      {r.objectives.map(o => (
                        <li key={o.id} className="flex items-center justify-between text-sm bg-gray-800 rounded-lg px-3 py-1">
                          <span className="text-gray-300">{o.name}</span>
                          <span className="text-blue-400">+{o.points} pt</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottone home */}
      <button
        onClick={() => router.push('/')}
        className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-xl transition"
      >
        🏠 Torna alla home
      </button>

    </main>
  );
}
