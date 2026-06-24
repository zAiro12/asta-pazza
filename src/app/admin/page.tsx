'use client';
import { useState, useEffect, useCallback } from 'react';
import { signOut, useSession } from 'next-auth/react';

// ─── Types ───────────────────────────────────────────────────────────────────
type Category = { id: number; name: string };
type Good = { id: number; name: string; category_id: number; base_value: number; category_name?: string };
type Objective = { id: number; name: string; type: string; description: string; points: number; copies: number };
type GameEvent = { id: number; name: string; type: string; description: string; effect: string };
type Game = { id: number; code: string; status: string; created_at: string; finished_at: string | null; player_count?: number; total_turns: number; current_turn: number };
type WhitelistEntry = { id: number; email: string };
type Settings = Record<string, string>;

const TABS = [
  { id: 'settings',    label: 'Impostazioni',    icon: '⚙️' },
  { id: 'goods',       label: 'Beni',            icon: '📦' },
  { id: 'categories',  label: 'Categorie',       icon: '🏷️' },
  { id: 'events',      label: 'Eventi',          icon: '⚡' },
  { id: 'objectives',  label: 'Obiettivi',       icon: '🎯' },
  { id: 'bonuses',     label: 'Bonus & Penalità',icon: '🎁' },
  { id: 'sessions',    label: 'Partite/Sessioni',icon: '🎮' },
  { id: 'history',     label: 'Storico',         icon: '📊' },
  { id: 'whitelist',   label: 'Admin Whitelist', icon: '👥' },
];

export default function AdminPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState('settings');
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'ok' ? '✅' : '❌'} {toast.msg}
        </div>
      )}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button className="lg:hidden text-slate-400 hover:text-white" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <span className="text-amber-400 text-xl">🎰</span>
          <span className="font-bold text-white text-lg">Asta Pazza</span>
          <span className="text-slate-500 text-sm">/ Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-sm hidden sm:block">{session?.user?.email}</span>
          <button onClick={() => signOut({ callbackUrl: '/admin/login' })}
            className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg transition-colors">
            Esci
          </button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-40 w-56 bg-slate-800 border-r border-slate-700 pt-4 transition-transform duration-200 overflow-y-auto shrink-0`}>
          <nav className="px-2 space-y-1">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSidebarOpen(false); }}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  activeTab === tab.id ? 'bg-amber-500/20 text-amber-400 font-semibold' : 'text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}>
                <span>{tab.icon}</span><span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </aside>
        {sidebarOpen && <div className="lg:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setSidebarOpen(false)} />}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {activeTab === 'settings'   && <SettingsTab showToast={showToast} />}
          {activeTab === 'goods'      && <GoodsTab showToast={showToast} />}
          {activeTab === 'categories' && <CategoriesTab showToast={showToast} />}
          {activeTab === 'events'     && <EventsTab showToast={showToast} />}
          {activeTab === 'objectives' && <ObjectivesTab showToast={showToast} />}
          {activeTab === 'bonuses'    && <BonusesTab showToast={showToast} />}
          {activeTab === 'sessions'   && <SessionsTab showToast={showToast} />}
          {activeTab === 'history'    && <HistoryTab showToast={showToast} />}
          {activeTab === 'whitelist'  && <WhitelistTab showToast={showToast} />}
        </main>
      </div>
    </div>
  );
}

// ─── Shared UI ───────────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
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
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
function Inp({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
      <input {...props} className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder-slate-500" />
    </div>
  );
}
function Sel({ label, children, ...props }: { label: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
      <select {...props} className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500">
        {children}
      </select>
    </div>
  );
}
function Txa({ label, ...props }: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
      <textarea {...props} rows={3} className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder-slate-500 resize-none" />
    </div>
  );
}
function BtnPrimary({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} className={`bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50 ${p.className ?? ''}`}>{children}</button>;
}
function BtnDanger({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} className={`bg-red-600 hover:bg-red-500 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors ${p.className ?? ''}`}>{children}</button>;
}
function BtnGhost({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} className={`bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors ${p.className ?? ''}`}>{children}</button>;
}
function Badge({ label, color }: { label: string; color: string }) {
  const map: Record<string, string> = {
    lobby: 'bg-blue-500/20 text-blue-400',
    active: 'bg-emerald-500/20 text-emerald-400',
    finished: 'bg-slate-500/20 text-slate-400',
    comune: 'bg-sky-500/20 text-sky-400',
    raro: 'bg-purple-500/20 text-purple-400',
    categoria_base: 'bg-amber-500/20 text-amber-400',
    permanente: 'bg-emerald-500/20 text-emerald-400',
    istantaneo: 'bg-orange-500/20 text-orange-400',
    segreto: 'bg-purple-500/20 text-purple-400',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[color] ?? 'bg-slate-500/20 text-slate-400'}`}>{label}</span>;
}

async function api(url: string, method = 'GET', body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab({ showToast }: { showToast: (m: string, t?: 'ok' | 'err') => void }) {
  const [s, setS] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings').then(r => r.json()).then(d => { setS(d); setLoading(false); });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api('/api/admin/settings', 'POST', s);
      showToast('Impostazioni salvate!');
    } catch { showToast('Errore salvataggio', 'err'); }
    finally { setSaving(false); }
  };

  const set = (k: string, v: string) => setS(prev => ({ ...prev, [k]: v }));

  if (loading) return <div className="text-slate-400 text-sm">Caricamento...</div>;

  return (
    <div className="max-w-2xl space-y-8">
      <SectionHeader title="⚙️ Impostazioni Partita" subtitle="Parametri globali applicati a tutte le nuove partite" />

      <div className="bg-slate-800 rounded-2xl p-5 space-y-4 border border-slate-700">
        <h3 className="text-white font-semibold text-sm uppercase tracking-wide text-slate-400">🕐 Asta</h3>
        <Inp label="Secondi per ogni asta" type="number" min={5} value={s.auction_timer_seconds ?? '45'}
          onChange={e => set('auction_timer_seconds', e.target.value)} />
        <Inp label="Crediti iniziali per giocatore" type="number" min={10} value={s.starting_credits ?? '150'}
          onChange={e => set('starting_credits', e.target.value)} />
      </div>

      <div className="bg-slate-800 rounded-2xl p-5 space-y-4 border border-slate-700">
        <h3 className="text-sm uppercase tracking-wide text-slate-400">😈 Scugnizzu</h3>
        <div className="grid grid-cols-2 gap-4">
          <Inp label="Crediti extra ottenuti" type="number" min={0} value={s.scugnizzu_credits ?? '30'}
            onChange={e => set('scugnizzu_credits', e.target.value)} />
          <Inp label="Penalità punti" type="number" min={0} value={s.scugnizzu_penalty ?? '15'}
            onChange={e => set('scugnizzu_penalty', e.target.value)} />
        </div>
        <p className="text-xs text-slate-500">Il giocatore riceve i crediti extra ma perde i punti indicati a fine partita.</p>
      </div>

      <div className="bg-slate-800 rounded-2xl p-5 space-y-4 border border-slate-700">
        <h3 className="text-sm uppercase tracking-wide text-slate-400">💰 Crediti Residui</h3>
        <div className="flex items-center gap-3">
          <input type="checkbox" id="cred_enabled" className="w-4 h-4 accent-amber-500"
            checked={s.credits_residual_enabled === 'true'}
            onChange={e => set('credits_residual_enabled', e.target.checked ? 'true' : 'false')} />
          <label htmlFor="cred_enabled" className="text-sm text-slate-300">Abilita crediti residui come punti a fine partita</label>
        </div>
        <Inp label="Cap massimo crediti convertibili in punti" type="number" min={0} value={s.credits_residual_max ?? '50'}
          onChange={e => set('credits_residual_max', e.target.value)}
          disabled={s.credits_residual_enabled !== 'true'} />
      </div>

      <BtnPrimary onClick={save} disabled={saving}>{saving ? 'Salvataggio...' : '💾 Salva Impostazioni'}</BtnPrimary>
    </div>
  );
}

// ─── Bonuses Tab ──────────────────────────────────────────────────────────────
function BonusesTab({ showToast }: { showToast: (m: string, t?: 'ok' | 'err') => void }) {
  const [s, setS] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings').then(r => r.json()).then(d => { setS(d); setLoading(false); });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api('/api/admin/settings', 'POST', s);
      showToast('Bonus & Penalità salvati!');
    } catch { showToast('Errore salvataggio', 'err'); }
    finally { setSaving(false); }
  };

  const set = (k: string, v: string) => setS(prev => ({ ...prev, [k]: v }));

  if (loading) return <div className="text-slate-400 text-sm">Caricamento...</div>;

  return (
    <div className="max-w-2xl space-y-8">
      <SectionHeader title="🎁 Bonus Generali & Penalità" subtitle="Punti assegnati per collezioni, maggioranza e penalità" />

      <div className="bg-slate-800 rounded-2xl p-5 space-y-4 border border-slate-700">
        <h3 className="text-sm uppercase tracking-wide text-slate-400">📦 Collezioni</h3>
        <div className="grid grid-cols-2 gap-4">
          <Inp label="Mini-Collezione (2/3 beni stessa cat.)" type="number" min={0} value={s.mini_collection_points ?? '5'}
            onChange={e => set('mini_collection_points', e.target.value)} />
          <Inp label="Collezione Completa (3/3 beni)" type="number" min={0} value={s.full_collection_points ?? '15'}
            onChange={e => set('full_collection_points', e.target.value)} />
        </div>
        <Inp label="Bonus Maggioranza di Categoria" type="number" min={0} value={s.majority_points ?? '10'}
          onChange={e => set('majority_points', e.target.value)} />
        <p className="text-xs text-slate-500">La Collezione Completa include già la Mini-Collezione — assicurati che il valore sia coerente.</p>
      </div>

      <div className="bg-slate-800 rounded-2xl p-5 space-y-4 border border-slate-700">
        <h3 className="text-sm uppercase tracking-wide text-slate-400">😈 Scugnizzu (riepilogo)</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-700/50 rounded-xl p-3">
            <p className="text-xs text-slate-400">Crediti extra</p>
            <p className="text-2xl font-bold text-amber-400">+{s.scugnizzu_credits ?? 30}</p>
          </div>
          <div className="bg-slate-700/50 rounded-xl p-3">
            <p className="text-xs text-slate-400">Penalità punti</p>
            <p className="text-2xl font-bold text-red-400">-{s.scugnizzu_penalty ?? 15}</p>
          </div>
        </div>
        <p className="text-xs text-slate-500">Modificabile nella tab Impostazioni.</p>
      </div>

      <BtnPrimary onClick={save} disabled={saving}>{saving ? 'Salvataggio...' : '💾 Salva Bonus'}</BtnPrimary>
    </div>
  );
}

// ─── Categories Tab ───────────────────────────────────────────────────────────
function CategoriesTab({ showToast }: { showToast: (m: string, t?: 'ok' | 'err') => void }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | Partial<Category>>(null);
  const [form, setForm] = useState({ name: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const d = await fetch('/api/admin/categories').then(r => r.json());
    setCats(d); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ name: '' }); setModal({}); };
  const openEdit = (c: Category) => { setForm({ name: c.name }); setModal(c); };
  const closeModal = () => setModal(null);

  const save = async () => {
    try {
      if (modal?.id) await api(`/api/admin/categories/${modal.id}`, 'PUT', form);
      else await api('/api/admin/categories', 'POST', form);
      showToast(modal?.id ? 'Categoria aggiornata' : 'Categoria creata');
      closeModal(); load();
    } catch { showToast('Errore', 'err'); }
  };

  const del = async (id: number) => {
    if (!confirm('Eliminare questa categoria? I beni associati potrebbero avere problemi.')) return;
    try { await api(`/api/admin/categories/${id}`, 'DELETE'); showToast('Eliminata'); load(); }
    catch { showToast('Errore eliminazione', 'err'); }
  };

  return (
    <div>
      <SectionHeader title="🏷️ Categorie" subtitle={`${cats.length} categorie`}
        action={<BtnPrimary onClick={openNew}>+ Nuova Categoria</BtnPrimary>} />
      {loading ? <div className="text-slate-400 text-sm">Caricamento...</div> :
        cats.length === 0 ? <EmptyState message="Nessuna categoria" /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cats.map(c => (
              <div key={c.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center justify-between">
                <span className="text-white font-medium">{c.name}</span>
                <div className="flex gap-2">
                  <BtnGhost onClick={() => openEdit(c)}>✏️</BtnGhost>
                  <BtnDanger onClick={() => del(c.id)}>🗑️</BtnDanger>
                </div>
              </div>
            ))}
          </div>
        )}
      {modal !== null && (
        <Modal title={modal.id ? 'Modifica Categoria' : 'Nuova Categoria'} onClose={closeModal}>
          <div className="space-y-4">
            <Inp label="Nome" value={form.name} onChange={e => setForm({ name: e.target.value })} placeholder="es. Arte, Tecnologia..." />
            <BtnPrimary onClick={save} className="w-full">Salva</BtnPrimary>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Goods Tab ────────────────────────────────────────────────────────────────
function GoodsTab({ showToast }: { showToast: (m: string, t?: 'ok' | 'err') => void }) {
  const [goods, setGoods] = useState<Good[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | Partial<Good>>(null);
  const [form, setForm] = useState({ name: '', category_id: '', base_value: '' });
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [g, c] = await Promise.all([
      fetch('/api/admin/goods').then(r => r.json()),
      fetch('/api/admin/categories').then(r => r.json()),
    ]);
    setGoods(g); setCats(c); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ name: '', category_id: cats[0]?.id?.toString() ?? '', base_value: '' }); setModal({}); };
  const openEdit = (g: Good) => { setForm({ name: g.name, category_id: g.category_id.toString(), base_value: g.base_value.toString() }); setModal(g); };

  const save = async () => {
    try {
      const body = { name: form.name, categoryId: Number(form.category_id), baseValue: Number(form.base_value) };
      if (modal?.id) await api(`/api/admin/goods/${modal.id}`, 'PUT', body);
      else await api('/api/admin/goods', 'POST', body);
      showToast(modal?.id ? 'Bene aggiornato' : 'Bene creato');
      setModal(null); load();
    } catch { showToast('Errore', 'err'); }
  };

  const del = async (id: number) => {
    if (!confirm('Eliminare questo bene?')) return;
    try { await api(`/api/admin/goods/${id}`, 'DELETE'); showToast('Eliminato'); load(); }
    catch { showToast('Errore eliminazione', 'err'); }
  };

  const filtered = goods.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    (g.category_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <SectionHeader title="📦 Beni" subtitle={`${goods.length} beni totali`}
        action={<BtnPrimary onClick={openNew}>+ Nuovo Bene</BtnPrimary>} />
      <div className="mb-4">
        <input className="w-full max-w-xs bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500 placeholder-slate-500"
          placeholder="Cerca bene o categoria..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {loading ? <div className="text-slate-400 text-sm">Caricamento...</div> :
        filtered.length === 0 ? <EmptyState message="Nessun bene trovato" /> : (
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-slate-400 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-right">Valore</th>
                  <th className="px-4 py-3 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filtered.map(g => (
                  <tr key={g.id} className="bg-slate-800/50 hover:bg-slate-700/50 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{g.name}</td>
                    <td className="px-4 py-3"><span className="text-slate-300">{g.category_name}</span></td>
                    <td className="px-4 py-3 text-right"><span className="text-amber-400 font-semibold">{g.base_value} pt</span></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <BtnGhost onClick={() => openEdit(g)}>✏️ Modifica</BtnGhost>
                        <BtnDanger onClick={() => del(g.id)}>🗑️</BtnDanger>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {modal !== null && (
        <Modal title={modal.id ? 'Modifica Bene' : 'Nuovo Bene'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Inp label="Nome" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            <Sel label="Categoria" value={form.category_id} onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Sel>
            <Inp label="Valore base (punti)" type="number" min={1} value={form.base_value}
              onChange={e => setForm(p => ({ ...p, base_value: e.target.value }))} />
            <BtnPrimary onClick={save} className="w-full">Salva</BtnPrimary>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Events Tab ───────────────────────────────────────────────────────────────
function EventsTab({ showToast }: { showToast: (m: string, t?: 'ok' | 'err') => void }) {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | Partial<GameEvent>>(null);
  const [form, setForm] = useState({ name: '', type: 'istantaneo', description: '', effect: '{}' });

  const load = useCallback(async () => {
    setLoading(true);
    const d = await fetch('/api/admin/events').then(r => r.json());
    setEvents(d); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ name: '', type: 'istantaneo', description: '', effect: '{}' }); setModal({}); };
  const openEdit = (e: GameEvent) => {
    setForm({ name: e.name, type: e.type, description: e.description, effect: typeof e.effect === 'string' ? e.effect : JSON.stringify(e.effect, null, 2) });
    setModal(e);
  };

  const save = async () => {
    try {
      let effectParsed: unknown;
      try { effectParsed = JSON.parse(form.effect); } catch { showToast('Effetto JSON non valido', 'err'); return; }
      const body = { name: form.name, type: form.type, description: form.description, effect: effectParsed };
      if (modal?.id) await api(`/api/admin/events/${modal.id}`, 'PUT', body);
      else await api('/api/admin/events', 'POST', body);
      showToast(modal?.id ? 'Evento aggiornato' : 'Evento creato');
      setModal(null); load();
    } catch { showToast('Errore', 'err'); }
  };

  const del = async (id: number) => {
    if (!confirm('Eliminare questo evento?')) return;
    try { await api(`/api/admin/events/${id}`, 'DELETE'); showToast('Eliminato'); load(); }
    catch { showToast('Errore', 'err'); }
  };

  return (
    <div>
      <SectionHeader title="⚡ Eventi" subtitle={`${events.length} eventi`}
        action={<BtnPrimary onClick={openNew}>+ Nuovo Evento</BtnPrimary>} />
      {loading ? <div className="text-slate-400 text-sm">Caricamento...</div> :
        events.length === 0 ? <EmptyState message="Nessun evento" /> : (
          <div className="space-y-3">
            {events.map(e => (
              <div key={e.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-semibold">{e.name}</span>
                      <Badge label={e.type} color={e.type} />
                    </div>
                    <p className="text-slate-400 text-sm">{e.description}</p>
                    <code className="text-xs text-slate-500 mt-1 block truncate">{typeof e.effect === 'string' ? e.effect : JSON.stringify(e.effect)}</code>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <BtnGhost onClick={() => openEdit(e)}>✏️</BtnGhost>
                    <BtnDanger onClick={() => del(e.id)}>🗑️</BtnDanger>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      {modal !== null && (
        <Modal title={modal.id ? 'Modifica Evento' : 'Nuovo Evento'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Inp label="Nome" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            <Sel label="Tipo" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              <option value="istantaneo">Istantaneo</option>
              <option value="permanente">Permanente</option>
              <option value="segreto">Segreto</option>
            </Sel>
            <Txa label="Descrizione" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Effetto (JSON)</label>
              <textarea
                className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none focus:border-amber-500 resize-none"
                rows={5} value={form.effect}
                onChange={e => setForm(p => ({ ...p, effect: e.target.value }))}
                placeholder='{"type": "category_bonus", "categoryId": 1, "delta": 10}' />
            </div>
            <BtnPrimary onClick={save} className="w-full">Salva</BtnPrimary>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Objectives Tab ───────────────────────────────────────────────────────────
function ObjectivesTab({ showToast }: { showToast: (m: string, t?: 'ok' | 'err') => void }) {
  const [objs, setObjs] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | Partial<Objective>>(null);
  const [form, setForm] = useState({ name: '', type: 'comune', description: '', points: '', copies: '1' });
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    const d = await fetch('/api/admin/objectives').then(r => r.json());
    setObjs(d); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ name: '', type: 'comune', description: '', points: '', copies: '1' }); setModal({}); };
  const openEdit = (o: Objective) => { setForm({ name: o.name, type: o.type, description: o.description, points: o.points.toString(), copies: o.copies.toString() }); setModal(o); };

  const save = async () => {
    try {
      const body = { name: form.name, type: form.type, description: form.description, points: Number(form.points), copies: Number(form.copies) };
      if (modal?.id) await api(`/api/admin/objectives/${modal.id}`, 'PUT', body);
      else await api('/api/admin/objectives', 'POST', body);
      showToast(modal?.id ? 'Obiettivo aggiornato' : 'Obiettivo creato');
      setModal(null); load();
    } catch { showToast('Errore', 'err'); }
  };

  const del = async (id: number) => {
    if (!confirm('Eliminare questo obiettivo?')) return;
    try { await api(`/api/admin/objectives/${id}`, 'DELETE'); showToast('Eliminato'); load(); }
    catch { showToast('Errore', 'err'); }
  };

  const filtered = filter === 'all' ? objs : objs.filter(o => o.type === filter);

  return (
    <div>
      <SectionHeader title="🎯 Obiettivi" subtitle={`${objs.length} obiettivi`}
        action={<BtnPrimary onClick={openNew}>+ Nuovo Obiettivo</BtnPrimary>} />
      <div className="flex gap-2 mb-4">
        {['all', 'comune', 'raro', 'categoria_base'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-400 hover:text-white'
            }`}>
            {f === 'all' ? 'Tutti' : f === 'categoria_base' ? 'Cat. Base' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      {loading ? <div className="text-slate-400 text-sm">Caricamento...</div> :
        filtered.length === 0 ? <EmptyState message="Nessun obiettivo" /> : (
          <div className="space-y-3">
            {filtered.map(o => (
              <div key={o.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-white font-semibold">{o.name}</span>
                      <Badge label={o.type === 'categoria_base' ? 'Cat. Base' : o.type} color={o.type} />
                      <span className="text-amber-400 text-sm font-bold">+{o.points} pt</span>
                      {o.copies > 1 && <span className="text-slate-400 text-xs">×{o.copies} copie</span>}
                    </div>
                    <p className="text-slate-400 text-sm">{o.description}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <BtnGhost onClick={() => openEdit(o)}>✏️</BtnGhost>
                    <BtnDanger onClick={() => del(o.id)}>🗑️</BtnDanger>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      {modal !== null && (
        <Modal title={modal.id ? 'Modifica Obiettivo' : 'Nuovo Obiettivo'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Inp label="Nome" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            <Sel label="Tipo" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              <option value="comune">Comune</option>
              <option value="raro">Raro</option>
              <option value="categoria_base">Categoria Base</option>
            </Sel>
            <Txa label="Descrizione" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            <div className="grid grid-cols-2 gap-4">
              <Inp label="Punti" type="number" min={1} value={form.points} onChange={e => setForm(p => ({ ...p, points: e.target.value }))} />
              <Inp label="Copie disponibili" type="number" min={1} value={form.copies} onChange={e => setForm(p => ({ ...p, copies: e.target.value }))} />
            </div>
            <BtnPrimary onClick={save} className="w-full">Salva</BtnPrimary>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Sessions Tab ─────────────────────────────────────────────────────────────
function SessionsTab({ showToast }: { showToast: (m: string, t?: 'ok' | 'err') => void }) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    const d = await fetch('/api/admin/sessions').then(r => r.json());
    setGames(d); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const closeGame = async (id: number) => {
    if (!confirm('Chiudere forzatamente questa partita?')) return;
    try { await api(`/api/admin/sessions/${id}`, 'PATCH'); showToast('Partita chiusa'); load(); }
    catch { showToast('Errore', 'err'); }
  };

  const deleteGame = async (id: number) => {
    if (!confirm('Eliminare definitivamente questa partita e tutti i suoi dati?')) return;
    try { await api(`/api/admin/sessions/${id}`, 'DELETE'); showToast('Partita eliminata'); load(); }
    catch { showToast('Errore eliminazione', 'err'); }
  };

  const clearLobby = async () => {
    if (!confirm('Eseguire DELETE_LOBBY_GAMES()? Verranno eliminate tutte le partite in stato "lobby".')) return;
    setClearing(true);
    try {
      await api('/api/admin/sessions/clear-lobby', 'POST');
      showToast('Lobby pulita con successo!');
      load();
    } catch { showToast('Errore nella stored procedure', 'err'); }
    finally { setClearing(false); }
  };

  const filtered = filter === 'all' ? games : games.filter(g => g.status === filter);
  const counts = { all: games.length, lobby: games.filter(g => g.status === 'lobby').length, active: games.filter(g => g.status === 'active').length, finished: games.filter(g => g.status === 'finished').length };

  return (
    <div>
      <SectionHeader title="🎮 Partite / Sessioni" subtitle={`${games.length} partite totali`}
        action={
          <button onClick={clearLobby} disabled={clearing}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            {clearing ? 'Pulizia...' : '🧹 Clear Lobby (stored proc.)'}
          </button>
        } />

      <div className="flex gap-2 mb-4 flex-wrap">
        {(['all', 'lobby', 'active', 'finished'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-400 hover:text-white'
            }`}>
            {f === 'all' ? 'Tutte' : f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="ml-1.5 bg-slate-600 rounded-full px-1.5 py-0.5 text-xs">{counts[f]}</span>
          </button>
        ))}
      </div>

      {loading ? <div className="text-slate-400 text-sm">Caricamento...</div> :
        filtered.length === 0 ? <EmptyState message="Nessuna partita" /> : (
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-slate-400 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Codice</th>
                  <th className="px-4 py-3 text-left">Stato</th>
                  <th className="px-4 py-3 text-right">Giocatori</th>
                  <th className="px-4 py-3 text-right">Turno</th>
                  <th className="px-4 py-3 text-left">Creata</th>
                  <th className="px-4 py-3 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filtered.map(g => (
                  <tr key={g.id} className="bg-slate-800/50 hover:bg-slate-700/50 transition-colors">
                    <td className="px-4 py-3"><span className="text-white font-mono font-bold">{g.code}</span></td>
                    <td className="px-4 py-3"><Badge label={g.status} color={g.status} /></td>
                    <td className="px-4 py-3 text-right text-slate-300">{g.player_count ?? 0}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{g.current_turn}/{g.total_turns}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{new Date(g.created_at).toLocaleString('it-IT')}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        {g.status !== 'finished' && (
                          <button onClick={() => closeGame(g.id)}
                            className="bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors">
                            ⏹ Chiudi
                          </button>
                        )}
                        <BtnDanger onClick={() => deleteGame(g.id)}>🗑️ Elimina</BtnDanger>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────
function HistoryTab({ showToast }: { showToast: (m: string, t?: 'ok' | 'err') => void }) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/sessions').then(r => r.json()).then(d => {
      setGames((d as Game[]).filter(g => g.status === 'finished'));
      setLoading(false);
    });
  }, []);

  const duration = (g: Game) => {
    if (!g.finished_at) return '—';
    const ms = new Date(g.finished_at).getTime() - new Date(g.created_at).getTime();
    const m = Math.floor(ms / 60000);
    return `${m} min`;
  };

  return (
    <div>
      <SectionHeader title="📊 Storico Partite" subtitle={`${games.length} partite concluse`} />
      {loading ? <div className="text-slate-400 text-sm">Caricamento...</div> :
        games.length === 0 ? <EmptyState message="Nessuna partita conclusa" /> : (
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-slate-400 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Codice</th>
                  <th className="px-4 py-3 text-right">Giocatori</th>
                  <th className="px-4 py-3 text-right">Turni</th>
                  <th className="px-4 py-3 text-left">Iniziata</th>
                  <th className="px-4 py-3 text-left">Conclusa</th>
                  <th className="px-4 py-3 text-right">Durata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {games.map(g => (
                  <tr key={g.id} className="bg-slate-800/50">
                    <td className="px-4 py-3 text-white font-mono font-bold">{g.code}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{g.player_count ?? 0}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{g.total_turns}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{new Date(g.created_at).toLocaleString('it-IT')}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{g.finished_at ? new Date(g.finished_at).toLocaleString('it-IT') : '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{duration(g)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

// ─── Whitelist Tab ────────────────────────────────────────────────────────────
function WhitelistTab({ showToast }: { showToast: (m: string, t?: 'ok' | 'err') => void }) {
  const [list, setList] = useState<WhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await fetch('/api/admin/whitelist').then(r => r.json());
    setList(d); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!newEmail.includes('@')) { showToast('Email non valida', 'err'); return; }
    setAdding(true);
    try { await api('/api/admin/whitelist', 'POST', { email: newEmail }); showToast('Email aggiunta'); setNewEmail(''); load(); }
    catch { showToast('Errore', 'err'); }
    finally { setAdding(false); }
  };

  const del = async (id: number, email: string) => {
    if (email === 'lucaairoldi92@gmail.com') { showToast('Non puoi rimuovere l\'admin principale', 'err'); return; }
    if (!confirm(`Rimuovere ${email} dalla whitelist?`)) return;
    try { await api(`/api/admin/whitelist/${id}`, 'DELETE'); showToast('Email rimossa'); load(); }
    catch { showToast('Errore', 'err'); }
  };

  return (
    <div className="max-w-xl">
      <SectionHeader title="👥 Admin Whitelist" subtitle="Email autorizzate ad accedere al pannello admin" />

      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 mb-6">
        <p className="text-xs text-slate-400 mb-3">Aggiungi una email che potrà accedere tramite login Google / GitHub / Microsoft</p>
        <div className="flex gap-2">
          <input className="flex-1 bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 placeholder-slate-500"
            placeholder="nuovadmin@email.com" value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()} />
          <BtnPrimary onClick={add} disabled={adding}>{adding ? '...' : '+ Aggiungi'}</BtnPrimary>
        </div>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4 text-xs text-amber-400">
        ⚠️ <strong>lucaairoldi92@gmail.com</strong> è l'admin principale hardcoded e non può essere rimosso.
      </div>

      {loading ? <div className="text-slate-400 text-sm">Caricamento...</div> :
        list.length === 0 ? <EmptyState message="Nessuna email aggiuntiva in whitelist" /> : (
          <div className="space-y-2">
            {list.map(e => (
              <div key={e.id} className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-white text-sm font-mono">{e.email}</span>
                <BtnDanger onClick={() => del(e.id, e.email)}>Rimuovi</BtnDanger>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
