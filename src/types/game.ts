// ─── Tipi principali di Asta Pazza ──────────────────────────────────────────

export type GameStatus = 'lobby' | 'active' | 'finished';
export type AuctionStatus = 'pending' | 'bidding' | 'revealing' | 'finished';
export type EventType = 'permanente' | 'istantaneo' | 'segreto';
export type ObjectiveType = 'categoria_base' | 'comune' | 'raro';

export interface Category {
  id: number;
  name: string;
}

export interface Good {
  id: number;
  name: string;
  categoryId: number;
  categoryName: string;
  baseValue: number;
}

export interface Objective {
  id: number;
  name: string;
  type: ObjectiveType;
  description: string;
  points: number;
  copies: number;
}

export interface GameEvent {
  id: number;
  name: string;
  type: EventType;
  effect: EventEffect;
  description: string;
}

export type EventEffect =
  | { type: 'category_bonus'; categoryName: string; delta: number }
  | { type: 'all_goods_bonus'; delta: number }
  | { type: 'instant_credits'; delta: number }
  | { type: 'credits_multiplier'; multiplier: number }
  | { type: 'collection_bonus'; bonusType: 'mini' | 'complete' | 'majority'; delta: number }
  | { type: 'collection_nullify'; bonusType: 'mini' | 'complete' | 'majority' }
  | { type: 'value_threshold_bonus'; threshold: number; above: boolean; delta: number }
  | { type: 'category_merge'; categories: string[] }
  | { type: 'secret_category_bonus'; delta: number } // rivelato a fine
  | { type: 'credits_penalty_above'; threshold: number; penalty: number }
  | { type: 'credits_bonus_below'; threshold: number; bonus: number };

export interface Player {
  id: number;
  gameId: number;
  name: string;
  credits: number;
  baseCategoryId: number | null;
  baseCategoryName?: string;
  usedScugnizzu: boolean;
  usedMercatoNero: boolean;
  isHost: boolean;
  socketId?: string;
}

export interface PlayerWithGoods extends Player {
  goods: Good[];
  score?: ScoreBreakdown;
}

export interface ScoreBreakdown {
  goodsValue: number;
  baseCategoryBonus: number;
  eventModifiers: number;
  miniCollections: number;
  completeCollections: number;
  majorityBonus: number;
  objectives: number;
  residualCredits: number;
  scugnizzuPenalty: number;
  total: number;
}

export interface Auction {
  id: number;
  gameId: number;
  goodId: number;
  good: Good;
  turn: number;
  status: AuctionStatus;
  winnerId?: number;
  winningBid?: number;
  bids?: Bid[];
  timerSeconds?: number;
}

export interface Bid {
  playerId: number;
  playerName: string;
  amount: number;
  isMercatoNero: boolean;
}

export interface Game {
  id: number;
  code: string;
  status: GameStatus;
  selectedCategoryIds: number[];
  currentTurn: number;
  totalTurns: number;
  activeEventIds: number[];
  players: Player[];
  currentAuction?: Auction;
}

// ─── Socket.io Events ────────────────────────────────────────────────────────

export interface ServerToClientEvents {
  'game:state': (game: Game) => void;
  'auction:start': (auction: Auction) => void;
  'auction:reveal': (auction: Auction) => void;
  'auction:end': (auction: Auction) => void;
  'event:trigger': (event: GameEvent) => void;
  'player:joined': (player: Player) => void;
  'player:left': (playerId: number) => void;
  'game:end': (players: PlayerWithGoods[]) => void;
  'error': (message: string) => void;
}

export interface ClientToServerEvents {
  'game:create': (playerName: string, categoryIds: number[]) => void;
  'game:join': (code: string, playerName: string) => void;
  'game:start': () => void;
  'auction:bid': (amount: number, isMercatoNero?: boolean) => void;
  'player:scugnizzu': () => void;
}
