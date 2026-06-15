# 🃏 Asta Pazza

Gioco di aste al buio in tempo reale. Acquista beni, costruisci collezioni, completa obiettivi e vinci!

## Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript
- **Real-time**: Socket.io
- **Database**: Neon (PostgreSQL) via `@neondatabase/serverless`
- **ORM**: Drizzle ORM
- **Hosting**: Vercel (frontend + API) + Neon (DB)

## Setup locale

```bash
npm install
cp .env.example .env.local
# Inserisci DATABASE_URL da Neon
npm run db:push
npm run db:seed
npm run dev
```

## Struttura

```
src/
  app/          → Pagine Next.js (App Router)
  components/   → Componenti React
  lib/          → Logica di gioco, utils
  server/       → Socket.io server (custom)
  types/        → TypeScript types
db/
  schema.ts     → Schema Drizzle ORM
  seed.ts       → Dati iniziali (beni, categorie, obiettivi, eventi)
```

## Regole rapide

- Ogni giocatore parte con **150 crediti**
- Aste al buio: offerta segreta → reveal simultaneo
- Categoria base: **+10 punti** per ogni bene di quella categoria
- **Scugnizzu**: +30 crediti, -15 punti a fine partita
- **Mercato Nero**: usa 1 volta, vinci pagando max_offerta_altri + 1
- Eventi ai turni 10, 20, 30... e all'ultimo turno
