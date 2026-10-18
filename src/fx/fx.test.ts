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
  it('勝者が必ず最初にゴールし、各馬は後退しない', () => {
    for (let n = 0; n < 50; n++) {
      const runners = cands.slice(0, 6);
      const winner = runners[n % 6];
      const plans = planRace(runners, winner, n % 2 === 0);
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
