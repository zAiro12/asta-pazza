"use client";

import { useState, useEffect, useCallback } from "react";
import { signOut, useSession } from "next-auth/react";

type Category = { id: number; name: string };
type Good = { id: number; name: string; categoryId: number; baseValue: number };
type Objective = {
  id: number;
  name: string;
  type: string;
  description: string;
  points: number;
  copies: number;
};
type GameEvent = {
  id: number;
  name: string;
  type: string;
  description: string;
  effect: object;
};
type Game = {
  id: number;
  code: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  playerCount?: number;
  totalTurns: number;
  currentTurn: number;
};
type WhitelistEntry = { id: number; email: string };
type GameSettings = {
  auctionTimerSeconds: number;
  startingCredits: number;
  scugnizzuCredits: number;
  scugnizzuPenalty: number;
  miniCollectionPoints: number;
  fullCollectionPoints: number;
  majorityPoints: number;
  creditsResidualMax: number;
  commonObjectivesCount: number;
  rareObjectivesCount: number;
};

const TABS = [
  { id: "settings", label: "Impostazioni", icon: "⚙️" },
  { id: "goods", label: "Beni", icon: "📦" },
  { id: "categories", label: "Categorie", icon: "🏷️" },
  { id: "events", label: "Eventi", icon: "⚡" },
  { id: "objectives", label: "Obiettivi", icon: "🎯" },
  { id: "bonuses", label: "Bonus & Penalità", icon: "🎁" },
  { id: "sessions", label: "Partite/Sessioni", icon: "🎮" },
  { id: "history", label: "Storico", icon: "📊" },
  { id: "whitelist", label: "Admin Whitelist", icon: "👥" },
];

export default function AdminPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState("settings");
  const [toast, setToast] = useState<{
    msg: string;
    type: "ok" | "err";
  } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
            toast.type === "ok"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.type === "ok" ? "✅" : "❌"} {toast.msg}
        </div>
      )}

      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            className="lg:hidden text-slate-400 hover:text-white"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-amber-400 text-xl">🎰</span>
          <span className="font-bold text-white text-lg">Asta Pazza</span>
          <span className="text-slate-500 text-sm">/ Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-sm hidden sm:block">
            {session?.user?.email}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            Esci
          </button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside
          className={`${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-40 w-56 bg-slate-800 border-r border-slate-700 pt-4 transition-transform duration-200 overflow-y-auto`}
        >
          <nav className="px-2 space-y-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSidebarOpen(false);
                }}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  activeTab === tab.id
                    ? "bg-amber-500/20 text-amber-400 font-semibold"
                    : "text-slate-400 hover:bg-slate-700 hover:text-white"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 z-30 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {activeTab === "settings" && <SettingsTab showToast={showToast} />}
          {activeTab === "goods" && <GoodsTab showToast={showToast} />}
          {activeTab === "categories" && (
            <CategoriesTab showToast={showToast} />
          )}
          {activeTab === "events" && <EventsTab showToast={showToast} />}
          {activeTab === "objectives" && (
            <ObjectivesTab showToast={showToast} />
          )}
          {activeTab === "bonuses" && <BonusesTab showToast={showToast} />}
          {activeTab === "sessions" && <SessionsTab showToast={showToast} />}
          {activeTab === "history" && <HistoryTab />}
          {activeTab === "whitelist" && <WhitelistTab showToast={showToast} />}
        </main>
      </div>
    </div>
  );
}

function useApi<T>(url: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load, ...deps]);
  return { data, loading, error, reload: load };
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
        {subtitle && <p className="text-slate-400 text-sm mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
function EmptyState({ message }: { message: string }) {
  return <div className="text-center py-12 text-slate-500"><div className="text-4xl mb-3">📭</div><p>{message}</p></div>;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Input({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">
        {label}
      </label>
      <input
        {...props}
        className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder-slate-500"
      />
    </div>
  );
}

function Select({
  label,
  children,
  ...props
}: { label: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">
        {label}
      </label>
      <select
        {...props}
        className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500"
      >
        {children}
      </select>
    </div>
  );
}

function Textarea({
  label,
  ...props
}: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">
        {label}
      </label>
      <textarea
        {...props}
        className="w-full min-h-28 bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder-slate-500"
      />
    </div>
  );
}

function PlaceholderTab({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <section>
      <SectionHeader title={title} subtitle={subtitle} />
      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/50 p-8">
        <EmptyState message="Questa sezione admin non e ancora disponibile in questa workspace snapshot." />
      </div>
    </section>
  );
}

function SettingsTab({
  showToast: _showToast,
}: {
  showToast: (msg: string, type?: "ok" | "err") => void;
}) {
  return (
    <PlaceholderTab
      title="Impostazioni"
      subtitle="Configurazione generale del gioco."
    />
  );
}

function GoodsTab({
  showToast: _showToast,
}: {
  showToast: (msg: string, type?: "ok" | "err") => void;
}) {
  return (
    <PlaceholderTab title="Beni" subtitle="Catalogo dei beni messi all'asta." />
  );
}

function CategoriesTab({
  showToast: _showToast,
}: {
  showToast: (msg: string, type?: "ok" | "err") => void;
}) {
  return (
    <PlaceholderTab
      title="Categorie"
      subtitle="Gestione delle categorie dei beni."
    />
  );
}

function EventsTab({
  showToast: _showToast,
}: {
  showToast: (msg: string, type?: "ok" | "err") => void;
}) {
  return (
    <PlaceholderTab title="Eventi" subtitle="Eventi speciali e loro effetti." />
  );
}

function ObjectivesTab({
  showToast: _showToast,
}: {
  showToast: (msg: string, type?: "ok" | "err") => void;
}) {
  return (
    <PlaceholderTab
      title="Obiettivi"
      subtitle="Obiettivi comuni e rari della partita."
    />
  );
}

function BonusesTab({
  showToast: _showToast,
}: {
  showToast: (msg: string, type?: "ok" | "err") => void;
}) {
  return (
    <PlaceholderTab
      title="Bonus & Penalita"
      subtitle="Regole accessorie e punteggi extra."
    />
  );
}

function SessionsTab({
  showToast: _showToast,
}: {
  showToast: (msg: string, type?: "ok" | "err") => void;
}) {
  return (
    <PlaceholderTab
      title="Partite / Sessioni"
      subtitle="Monitoraggio delle sessioni create dagli utenti."
    />
  );
}

function HistoryTab() {
  return (
    <PlaceholderTab
      title="Storico"
      subtitle="Archivio delle partite concluse."
    />
  );
}

function WhitelistTab({
  showToast: _showToast,
}: {
  showToast: (msg: string, type?: "ok" | "err") => void;
}) {
  return (
    <PlaceholderTab
      title="Admin Whitelist"
      subtitle="Utenti autorizzati ad accedere al pannello admin."
    />
  );
}
