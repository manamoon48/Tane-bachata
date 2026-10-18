export type Mode = 'home' | 'out';
export type OutKind = 'shop' | 'genre';
/** -3 は「除外」。それ以外は 2^level 倍の重み */
export type Level = -3 | -2 | -1 | 0 | 1 | 2 | 3;
export type EffectId = 'roulette' | 'slot' | 'gacha';
export type EffectChoice = EffectId | 'random';
export type Rarity = 'normal' | 'rare' | 'super';

export interface Item {
  id: string;
  mode: Mode;
  /** 外食のみ。内食は null */
  kind: OutKind | null;
  name: string;
  emoji: string;
  category: string;
  level: Level;
  tags: string[];
  /** 外食のお店なら地図検索ワード（住所など） */
  memo: string;
}

export interface HistoryEntry {
  id: string;
  itemId: string;
  name: string;
  emoji: string;
  mode: Mode;
  at: number;
}

export interface Settings {
  sound: boolean;
  recentPenalty: boolean;
  recentDays: number;
  effect: EffectChoice;
}

export interface State {
  version: 1;
  mode: Mode;
  outFilter: 'all' | OutKind;
  tagFilter: string[];
  items: Item[];
  history: HistoryEntry[];
  settings: Settings;
}

export interface Candidate {
  item: Item;
  weight: number;
  prob: number;
  recent: boolean;
}
