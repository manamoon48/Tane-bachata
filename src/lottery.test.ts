import { describe, expect, it } from 'vitest';
import { buildCandidates, levelWeight, pick, rarityOf, RECENT_FACTOR } from './lottery';
import type { Item, Level } from './types';

const item = (id: string, level: Level = 0, extra: Partial<Item> = {}): Item => ({
  id, mode: 'home', kind: null, name: id, emoji: '🍽️', category: '', level, tags: [], memo: '', ...extra,
});

describe('levelWeight', () => {
  it('除外は0、それ以外は2の累乗', () => {
    expect(levelWeight(-3)).toBe(0);
    expect(levelWeight(-2)).toBe(0.25);
    expect(levelWeight(0)).toBe(1);
    expect(levelWeight(3)).toBe(8);
  });
});

describe('buildCandidates', () => {
  it('確率は重みに比例し、合計が1になる', () => {
    const c = buildCandidates([item('a', 0), item('b', 1), item('c', -3)], { mode: 'home' });
    expect(c.map((x) => x.item.id)).toEqual(['a', 'b']);
    expect(c[0].prob).toBeCloseTo(1 / 3);
    expect(c[1].prob).toBeCloseTo(2 / 3);
  });

  it('モード・外食の種類・タグ(AND)で絞り込む', () => {
    const items = [
      item('home1', 0, { tags: ['安い', '時短'] }),
      item('home2', 0, { tags: ['安い'] }),
      item('shop', 0, { mode: 'out', kind: 'shop' }),
      item('genre', 0, { mode: 'out', kind: 'genre' }),
    ];
    expect(buildCandidates(items, { mode: 'home', tags: ['安い', '時短'] }).map((c) => c.item.id)).toEqual(['home1']);
    expect(buildCandidates(items, { mode: 'out', outFilter: 'shop' }).map((c) => c.item.id)).toEqual(['shop']);
    expect(buildCandidates(items, { mode: 'out', outFilter: 'all' })).toHaveLength(2);
  });

  it('最近食べたものは重みが下がる', () => {
    const now = Date.now();
    const history = [{ id: 'h', itemId: 'a', name: 'a', emoji: '', mode: 'home' as const, at: now - 3600_000 }];
    const c = buildCandidates([item('a'), item('b')], { mode: 'home', history, recentPenalty: true, recentDays: 3, now });
    expect(c[0].recent).toBe(true);
    expect(c[0].weight).toBe(RECENT_FACTOR);
    const off = buildCandidates([item('a'), item('b')], { mode: 'home', history, recentPenalty: false, now });
    expect(off[0].weight).toBe(1);
  });
});

describe('pick', () => {
  it('乱数に応じて累積重みで選ぶ', () => {
    const c = buildCandidates([item('a', 0), item('b', 1)], { mode: 'home' });
    expect(pick(c, () => 0).item.id).toBe('a');
    expect(pick(c, () => 0.34).item.id).toBe('b');
    expect(pick(c, () => 0.999).item.id).toBe('b');
  });

  it('分布がおおむね確率どおり', () => {
    const c = buildCandidates([item('a', 0), item('b', 2)], { mode: 'home' });
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let b = 0;
    for (let i = 0; i < 20000; i++) if (pick(c, rng).item.id === 'b') b++;
    expect(b / 20000).toBeGreaterThan(0.78);
    expect(b / 20000).toBeLessThan(0.82);
  });
});

describe('rarityOf', () => {
  it('平均より出にくいほどレア', () => {
    const c = buildCandidates([item('a', -2), item('b', -1), item('c', 0), item('d', 1)], { mode: 'home' });
    expect(rarityOf(c[0], 4)).toBe('super');
    expect(rarityOf(c[1], 4)).toBe('rare');
    expect(rarityOf(c[3], 4)).toBe('normal');
  });
});
