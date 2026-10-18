import { describe, expect, it } from 'vitest';
import { buildCandidates } from '../lottery';
import type { Item } from '../types';
import { findPath, makeBoard } from './plinko';
import { planRace, progressAt } from './race';

const items: Item[] = Array.from({ length: 12 }, (_, i) => ({
  id: `i${i}`, mode: 'home', kind: null, name: `n${i}`, emoji: '🍽️', category: '', level: ((i % 5) - 2) as Item['level'], tags: [], memo: '',
}));
const cands = buildCandidates(items, { mode: 'home' });

describe('race', () => {
  const runners = cands.slice(0, 6);
  const spread = (plans: ReturnType<typeof planRace>, t: number) => {
    const xs = plans.map((p) => progressAt(p, t));
    return Math.max(...xs) - Math.min(...xs);
  };

  it('勝者が必ず最初にゴールし、各馬は後退しない', () => {
    for (let n = 0; n < 60; n++) {
      const winner = runners[n % 6];
      const plans = planRace(runners, winner, (['front', 'comeback', 'pack'] as const)[n % 3]);
      for (const p of plans) {
        let prev = 0;
        for (let t = 0; t <= 1.3; t += 0.01) {
          const x = progressAt(p, t);
          expect(x).toBeGreaterThanOrEqual(prev - 1e-9);
          prev = x;
        }
        if (p.c === winner) expect(progressAt(p, 1)).toBeCloseTo(1);
        else expect(progressAt(p, 1)).toBeLessThan(1);
      }
    }
  });

  it('序盤は団子、終盤は下位が離れて上位が競る', () => {
    for (let n = 0; n < 60; n++) {
      const winner = runners[n % 6];
      const style = n % 2 ? 'front' : 'comeback';
      const plans = planRace(runners, winner, style);
      expect(spread(plans, 0.4)).toBeLessThan(0.05);
      const atGoal = plans.map((p) => progressAt(p, 1)).sort((a, b) => b - a);
      expect(atGoal[0] - atGoal[1]).toBeLessThan(0.04); // 上位は接戦
      expect(atGoal[0] - atGoal[atGoal.length - 1]).toBeGreaterThan(0.07); // 最下位は離れる
    }
  });

  it('団子パターンは最後まで横一線', () => {
    for (let n = 0; n < 30; n++) {
      const plans = planRace(runners, runners[n % 6], 'pack');
      for (const t of [0.4, 0.7, 0.85, 1]) expect(spread(plans, t)).toBeLessThan(0.06);
    }
  });
});

describe('plinko', () => {
  it('どの枠を狙っても、その枠に落ちる軌跡を返す', () => {
    const b = makeBoard(360, 500, cands.map((c) => c.prob));
    cands.forEach((_, target) => {
      const frames = findPath(b, 40 + target * 23, target);
      const last = frames[frames.length - 1];
      const slot = b.slots.findIndex((s) => last.x >= s.x0 && last.x < s.x1);
      expect(slot).toBe(target);
    });
  });
});
