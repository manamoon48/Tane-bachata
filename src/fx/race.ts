import { sfx, vibrate } from '../sound';
import { sampleWeighted } from '../lottery';
import type { Candidate } from '../types';
import { animate, h, rand, sleep } from '../ui';
import type { FxContext } from './index';

const MAX_RUNNERS = 6;
const K = 6; // チェックポイント数

interface Plan {
  c: Candidate;
  /** チェックポイントごとの進捗（0..1）。時間はレース全体の T を K 等分 */
  pts: number[];
  finish: number;
}

/** 勝者が必ず先着するよう、各馬の進捗曲線を作る */
export function planRace(runners: Candidate[], winner: Candidate, comeback: boolean): Plan[] {
  return runners.map((c) => {
    const isWin = c === winner;
    // ゴール時刻（勝者を 1 とした相対値）。2着はハナ差になりやすく
    const finish = isWin ? 1 : 1 + (Math.random() < 0.35 ? rand(0.005, 0.02) : rand(0.03, 0.15));
    const final = 1 / finish;
    const pts = [0];
    for (let k = 1; k < K; k++) {
      let noise = rand(-0.07, 0.07);
      if (isWin && comeback && k >= 2 && k <= K - 2) noise = -rand(0.06, 0.12); // 中盤は出遅れ
      if (!isWin && comeback && k >= 2 && k <= K - 2) noise += 0.03;
      // 単調増加かつ、ゴール時の位置を追い越さない範囲に収める
      const lo = pts[k - 1] + 0.01;
      const hi = final - 0.015 * (K - k);
      pts.push(Math.min(hi, Math.max(lo, (k / K) * final + noise)));
    }
    pts.push(final);
    return { c, pts, finish };
  });
}

export function progressAt(p: Plan, t: number): number {
  // t は勝者ゴール = 1。ゴール後は各馬のゴール時刻まで直線で伸ばす
  if (t >= 1) return Math.min(1, p.pts[K] + ((1 - p.pts[K]) * (t - 1)) / Math.max(0.001, p.finish - 1));
  const x = t * K;
  const k = Math.min(K - 1, Math.floor(x));
  const f = x - k;
  const s = f * f * (3 - 2 * f);
  return p.pts[k] + (p.pts[k + 1] - p.pts[k]) * s;
}

export async function race(ctx: FxContext): Promise<void> {
  const { stage, signal, winner, cands } = ctx;
  // 当選 + 確率に応じて選んだライバルで出走。枠順はシャッフル
  const runners = sampleWeighted(cands, MAX_RUNNERS, winner).sort(() => Math.random() - 0.5);
  const comeback = Math.random() < 0.5;
  const plans = planRace(runners, winner, comeback);
  const T = 7.5; // 勝者のゴールまでの秒数

  const lanes = plans.map((p, i) => {
    const runner = h('div', { class: 'runner' }, [h('span', { class: 'runner-emoji' }, p.c.item.emoji), h('span', { class: 'runner-no' }, String(i + 1))]);
    const lane = h('div', { class: 'lane' }, [h('span', { class: 'lane-name' }, `${i + 1} ${p.c.item.name}`), runner]);
    return { lane, runner, plan: p };
  });
  const track = h('div', { class: 'track' }, [...lanes.map((l) => l.lane), h('div', { class: 'goal' })]);
  const ticker = h('div', { class: 'ticker' }, 'さあ、本日のメインレース！');
  const btn = h('button', { class: 'slot-stop' }, 'スタート！');
  stage.append(h('div', { class: 'fx-race' }, [h('div', { class: 'race-title' }, '🏁 ごはん杯 🏁'), ticker, track, btn]));

  const trackW = () => track.clientWidth - 44 - 28;
  const place = (t: number) => {
    const w = trackW();
    for (const l of lanes) l.runner.style.transform = `translateX(${progressAt(l.plan, t) * w}px)`;
  };
  place(0);
  sfx.raceFanfare();

  await new Promise<void>((resolve) => {
    const go = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(go, 6000);
    btn.addEventListener('click', go, { once: true });
    signal.addEventListener('abort', go);
  });
  if (signal.aborted) return;
  btn.remove();
  sfx.gun();
  vibrate(40);
  ticker.textContent = 'スタートしました！';
  track.classList.add('running');

  const leader = (t: number) => plans.reduce((a, b) => (progressAt(b, t) > progressAt(a, t) ? b : a));
  const lines: [number, (t: number) => string][] = [
    [0.18, (t) => `先頭は${leader(t).c.item.name}！`],
    [0.38, (t) => `${leader(t).c.item.name}がリード、後続も食らいつく！`],
    [0.58, (t) => (comeback ? `おっと${winner.item.name}、まだ後方だ！` : `${leader(t).c.item.name}が抜け出したか！`)],
    [0.76, () => '最後の直線！'],
    [0.9, () => (comeback ? `${winner.item.name}が猛追！ 大外から来た！` : `${winner.item.name}粘る！ 粘る！`)],
  ];
  let li = 0;
  let lastGallop = 0;
  const t0 = performance.now();
  let goalShown = false;
  await animate((now) => {
    const t = (now - t0) / 1000 / T;
    place(t);
    if (li < lines.length && t >= lines[li][0]) ticker.textContent = lines[li++][1](t);
    if (now - lastGallop > 330) {
      lastGallop = now;
      sfx.gallop();
    }
    if (t > 0.82 && !track.classList.contains('final')) {
      track.classList.add('final');
      sfx.cheer(2);
    }
    if (t >= 1 && !goalShown) {
      goalShown = true;
      const second = [...plans].filter((p) => p !== plans.find((x) => x.c === winner)).sort((a, b) => a.finish - b.finish)[0];
      const close = second && second.finish - 1 < 0.02;
      ticker.textContent = `${winner.item.name}、${comeback ? '差し切って' : '逃げ切って'}ゴール！${close ? '（ハナ差！）' : ''}`;
      lanes.find((l) => l.plan.c === winner)!.lane.classList.add('win');
      sfx.stop();
      vibrate([40, 30, 80]);
    }
    return t < 1.2;
  }, signal);
  await sleep(1200, signal);
}
