import type { Candidate, HistoryEntry, Item, Level, Mode, OutKind, Rarity } from './types';

export const LEVELS: Level[] = [-3, -2, -1, 0, 1, 2, 3];
/** 最近食べたものに掛ける係数 */
export const RECENT_FACTOR = 0.25;
const DAY = 86_400_000;

export function levelWeight(level: Level): number {
  return level <= -3 ? 0 : 2 ** level;
}

export function levelLabel(level: Level): string {
  if (level <= -3) return '除外';
  if (level === 0) return '±0';
  return level > 0 ? `+${level}` : `−${-level}`;
}

export function weightLabel(level: Level): string {
  const w = levelWeight(level);
  if (w === 0) return '出ない';
  return `×${w < 1 ? w.toString().replace(/^0/, '') : w}`;
}

export interface CandidateOptions {
  mode: Mode;
  outFilter?: 'all' | OutKind;
  tags?: string[];
  history?: HistoryEntry[];
  recentPenalty?: boolean;
  recentDays?: number;
  now?: number;
}

export function recentItemIds(history: HistoryEntry[], days: number, now = Date.now()): Set<string> {
  const since = now - days * DAY;
  return new Set(history.filter((h) => h.at >= since).map((h) => h.itemId));
}

export function buildCandidates(items: Item[], opts: CandidateOptions): Candidate[] {
  const tags = opts.tags ?? [];
  const recent = opts.recentPenalty
    ? recentItemIds(opts.history ?? [], opts.recentDays ?? 3, opts.now)
    : new Set<string>();
  const list = items
    .filter((it) => it.mode === opts.mode)
    .filter((it) => opts.mode !== 'out' || !opts.outFilter || opts.outFilter === 'all' || it.kind === opts.outFilter)
    .filter((it) => tags.every((t) => it.tags.includes(t)))
    .map((item) => {
      const isRecent = recent.has(item.id);
      const weight = levelWeight(item.level) * (isRecent ? RECENT_FACTOR : 1);
      return { item, weight, prob: 0, recent: isRecent };
    })
    .filter((c) => c.weight > 0);
  const total = list.reduce((s, c) => s + c.weight, 0);
  for (const c of list) c.prob = c.weight / total;
  return list;
}

export function pick(cands: Candidate[], rand: () => number = Math.random): Candidate {
  if (cands.length === 0) throw new Error('no candidates');
  const total = cands.reduce((s, c) => s + c.weight, 0);
  let r = rand() * total;
  for (const c of cands) {
    r -= c.weight;
    if (r < 0) return c;
  }
  return cands[cands.length - 1];
}

/** 平均的な確率 (1/n) と比べてどれだけ出にくいかでレア度を決める */
export function rarityOf(c: Candidate, count: number): Rarity {
  if (count <= 1) return 'normal';
  const ratio = c.prob * count;
  if (ratio <= 0.35) return 'super';
  if (ratio <= 0.7) return 'rare';
  return 'normal';
}

export function formatProb(p: number): string {
  const pct = p * 100;
  if (pct >= 10) return `${pct.toFixed(0)}%`;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

/** 重みに応じて n 件を重複なしで選ぶ（must は必ず含める） */
export function sampleWeighted(cands: Candidate[], n: number, must?: Candidate, rand: () => number = Math.random): Candidate[] {
  const pool = cands.filter((c) => c !== must);
  const out = must ? [must] : [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(pool.indexOf(pick(pool, rand)), 1)[0]);
  }
  return out;
}
