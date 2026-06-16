import { pgTable, serial, text, integer, boolean, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';

// ─── Enums ────────────────────────────────────────────────────────────────────
export const gameStatusEnum = pgEnum('game_status', ['lobby', 'active', 'finished']);
export const auctionStatusEnum = pgEnum('auction_status', ['pending', 'bidding', 'revealing', 'finished']);
export const eventTypeEnum = pgEnum('event_type', ['permanente', 'istantaneo', 'segreto']);
export const objectiveTypeEnum = pgEnum('objective_type', ['categoria_base', 'comune', 'raro']);

// ─── Categorie ────────────────────────────────────────────────────────────────
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
});

// ─── Beni ─────────────────────────────────────────────────────────────────────
export const goods = pgTable('goods', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  categoryId: integer('category_id').references(() => categories.id).notNull(),
  baseValue: integer('base_value').notNull(),
});

// ─── Obiettivi ────────────────────────────────────────────────────────────────
export const objectives = pgTable('objectives', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: objectiveTypeEnum('type').notNull(),
  description: text('description').notNull(),
  points: integer('points').notNull(),
  copies: integer('copies').notNull().default(1),
  // Condizione in formato JSON per la verifica automatica
  condition: jsonb('condition'),
});

// ─── Eventi ───────────────────────────────────────────────────────────────────
export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: eventTypeEnum('type').notNull(),
  // Effetto in formato JSON: { type: 'category_bonus', categoryId: X, delta: 10 }
  effect: jsonb('effect').notNull(),
  description: text('description').notNull(),
});

// ─── Partite ──────────────────────────────────────────────────────────────────
export const games = pgTable('games', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // codice sala es. "XKQZ"
  status: gameStatusEnum('status').notNull().default('lobby'),
  selectedCategoryIds: jsonb('selected_category_ids').notNull().default('[]'), // int[]
  currentTurn: integer('current_turn').notNull().default(0),
  totalTurns: integer('total_turns').notNull().default(0),
  activeEventIds: jsonb('active_event_ids').notNull().default('[]'), // int[]
  // Quanti obiettivi comuni e rari riceve ogni giocatore (impostabili dall'host)
  commonObjectivesCount: integer('common_objectives_count').notNull().default(1),
  rareObjectivesCount: integer('rare_objectives_count').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow(),
  finishedAt: timestamp('finished_at'),
});

// ─── Giocatori ────────────────────────────────────────────────────────────────
export const players = pgTable('players', {
  id: serial('id').primaryKey(),
  gameId: integer('game_id').references(() => games.id).notNull(),
  name: text('name').notNull(),
  credits: integer('credits').notNull().default(150),
  baseCategoryId: integer('base_category_id').references(() => categories.id),
  usedScugnizzu: boolean('used_scugnizzu').notNull().default(false),
  usedMercatoNero: boolean('used_mercato_nero').notNull().default(false),
  socketId: text('socket_id'),
  isHost: boolean('is_host').notNull().default(false),
  joinedAt: timestamp('joined_at').defaultNow(),
});

// ─── Beni posseduti ───────────────────────────────────────────────────────────
export const playerGoods = pgTable('player_goods', {
  id: serial('id').primaryKey(),
  playerId: integer('player_id').references(() => players.id).notNull(),
  gameId: integer('game_id').references(() => games.id).notNull(),
  goodId: integer('good_id').references(() => goods.id).notNull(),
  pricePaid: integer('price_paid').notNull(),
  wonAtTurn: integer('won_at_turn').notNull(),
});

// ─── Aste ─────────────────────────────────────────────────────────────────────
export const auctions = pgTable('auctions', {
  id: serial('id').primaryKey(),
  gameId: integer('game_id').references(() => games.id).notNull(),
  goodId: integer('good_id').references(() => goods.id).notNull(),
  turn: integer('turn').notNull(),
  status: auctionStatusEnum('status').notNull().default('pending'),
  winnerId: integer('winner_id').references(() => players.id),
  winningBid: integer('winning_bid'),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
});

// ─── Offerte ──────────────────────────────────────────────────────────────────
export const bids = pgTable('bids', {
  id: serial('id').primaryKey(),
  auctionId: integer('auction_id').references(() => auctions.id).notNull(),
  playerId: integer('player_id').references(() => players.id).notNull(),
  amount: integer('amount').notNull(),
  isMercatoNero: boolean('is_mercato_nero').notNull().default(false),
  submittedAt: timestamp('submitted_at').defaultNow(),
});

// ─── Obiettivi completati ─────────────────────────────────────────────────────
export const playerObjectives = pgTable('player_objectives', {
  id: serial('id').primaryKey(),
  playerId: integer('player_id').references(() => players.id).notNull(),
  gameId: integer('game_id').references(() => games.id).notNull(),
  objectiveId: integer('objective_id').references(() => objectives.id).notNull(),
});

// ─── Obiettivi assegnati ──────────────────────────────────────────────────────
// Traccia quale obiettivo (comune/raro/categoria_base) è stato assegnato a quale
// giocatore all'avvio della partita. È la sorgente di verità per la visibilità
// privata: ogni giocatore vede solo i propri.
export const playerObjectiveAssignments = pgTable('player_objective_assignments', {
  id: serial('id').primaryKey(),
  playerId: integer('player_id').references(() => players.id).notNull(),
  gameId: integer('game_id').references(() => games.id).notNull(),
  objectiveId: integer('objective_id').references(() => objectives.id).notNull(),
  type: objectiveTypeEnum('type').notNull(), // replica del tipo per query rapide
});
