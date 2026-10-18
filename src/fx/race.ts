import { sfx, vibrate } from '../sound';
import { sampleWeighted } from '../lottery';
import type { Candidate } from '../types';
import { animate, h, rand, sleep } from '../ui';
import type { FxContext } from './index';

const MAX_RUNNERS = 6;
/** チェックポイントの時刻（勝者のゴール = 1） */
const KNOTS = [0, 0.2, 0.4, 0.55, 0.7, 0.85, 1];
const K = KNOTS.length - 1;

/** 展開: 中盤から下位が離れて上位が競る（逃げ切り / 差し切り）、または最後まで団子 */
export type RaceStyle = 'front' | 'comeback' | 'pack';

export interface Plan {
  c: Candidate;
  /** チェックポイントごとの進捗（0..1） */
  pts: number[];
}

/**
 * 勝者が必ず先着するよう、各馬の進捗曲線を作る。
 * 進捗は「勝者のペース t」からの遅れ（offset）で決める: 序盤は全馬が団子、
 * 中盤から下位がじわじわ離れ、終盤は勝者とライバル1〜2頭が競り合う。
 */
export function planRace(runners: Candidate[], winner: Candidate, style: RaceStyle): Plan[] {
  const others = runners.filter((c) => c !== winner).sort(() => Math.random() - 0.5);
  const rivals = new Set(others.slice(0, others.length >= 3 && Math.random() < 0.5 ? 2 : 1));
  return runners.map((c) => {
    const isWin = c === winner;
    const off: number[] = [0];
    // 序盤（〜0.4）は団子
    off.push(rand(-0.015, 0.015), rand(-0.015, 0.015));
    if (style === 'pack') {
      // 最後まで横一線。ゴールはハナ差〜クビ差
      off.push(rand(-0.02, 0.02), rand(-0.02, 0.02), rand(-0.02, 0.02), isWin ? 0 : rand(0.004, 0.03));
    } else if (!isWin && !rivals.has(c)) {
      // 下位: 中盤から少しずつ離れていく
      const sep = rand(0.14, 0.3);
      off.push(sep * 0.35, sep * 0.7, sep * 0.9, sep);
    } else if (isWin) {
      // 差し切りは終盤まで少し後ろ、逃げ切りは前目
      off.push(rand(-0.01, 0.015), style === 'comeback' ? rand(0.015, 0.03) : rand(-0.015, 0.005), style === 'comeback' ? rand(0.02, 0.035) : rand(-0.012, 0.004), 0);
    } else {
      // ライバル: 勝者と抜きつ抜かれつ、最後はわずかに届かない
      off.push(rand(-0.015, 0.015), style === 'comeback' ? rand(-0.012, 0.008) : rand(-0.005, 0.02), style === 'comeback' ? rand(-0.01, 0.01) : rand(0, 0.02), rand(0.004, 0.03));
    }
    // 単調増加に整える（ゴール時の位置は動かさない）
    const pts = KNOTS.map((t, k) => t - off[k]);
    pts[0] = 0;
    for (let k = K - 1; k >= 1; k--) pts[k] = Math.min(pts[k], pts[k + 1] - 0.01);
    for (let k = 1; k <= K; k++) pts[k] = Math.max(pts[k], pts[k - 1] + 0.005);
    return { c, pts };
  });
}

export function progressAt(p: Plan, t: number): number {
  // ゴール後の各馬は勝者のペースのまま伸ばす
  if (t >= 1) return Math.min(1, p.pts[K] + (t - 1));
  if (t <= 0) return 0;
  let k = 0;
  while (k < K - 1 && t >= KNOTS[k + 1]) k++;
  const f = (t - KNOTS[k]) / (KNOTS[k + 1] - KNOTS[k]);
  const s = f * f * (3 - 2 * f);
  return p.pts[k] + (p.pts[k + 1] - p.pts[k]) * s;
}

export async function race(ctx: FxContext): Promise<void> {
  const { stage, signal, winner, cands } = ctx;
  // 当選 + 確率に応じて選んだライバルで出走。枠順はシャッフル
  const runners = sampleWeighted(cands, MAX_RUNNERS, winner).sort(() => Math.random() - 0.5);
  const r = Math.random();
  const style: RaceStyle = r < 0.2 ? 'pack' : r < 0.6 ? 'comeback' : 'front';
  const plans = planRace(runners, winner, style);
  const T = 11.25; // 勝者のゴールまでの秒数

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

  const order = (t: number) => [...plans].sort((a, b) => progressAt(b, t) - progressAt(a, t)).map((p) => p.c.item.name);
  const rival = (t: number) => order(t).find((n) => n !== winner.item.name) ?? '';
  const lines: [number, (t: number) => string][] = [
    [0.12, (t) => `各馬一団となって進みます。先頭は${order(t)[0]}`],
    [0.3, () => 'まだ団子状態！ どれが抜け出すか！'],
    [
      0.5,
      (t) => (style === 'pack' ? 'まだ横一線！ これは分からない！' : `ここで${order(t)[plans.length - 1]}が遅れ始めた！`),
    ],
    [
      0.66,
      (t) => (style === 'pack' ? '全員が並んだまま最終コーナーへ！' : `先頭争いは${order(t).slice(0, plans.length > 3 ? 3 : 2).join('、')}！`),
    ],
    [0.8, (t) => `最後の直線！ ${order(t)[0]}か、${order(t)[1]}か！`],
    [
      0.92,
      (t) =>
        style === 'pack'
          ? '横一線のままゴール前！'
          : style === 'comeback'
            ? `${winner.item.name}が外から差してきた！`
            : `${winner.item.name}粘る！ ${rival(t)}も迫る！`,
    ],
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
    if (t > 0.8 && !track.classList.contains('final')) {
      track.classList.add('final');
      sfx.cheer(2.5);
    }
    if (t >= 1 && !goalShown) {
      goalShown = true;
      const gap = 1 - Math.max(...plans.filter((p) => p.c !== winner).map((p) => p.pts[K]), 0);
      const how = style === 'pack' ? '大接戦を制して' : style === 'comeback' ? '差し切って' : '逃げ切って';
      ticker.textContent = `${winner.item.name}、${how}ゴール！${gap < 0.012 ? '（ハナ差！）' : gap < 0.03 ? '（クビ差！）' : ''}`;
      lanes.find((l) => l.plan.c === winner)!.lane.classList.add('win');
      sfx.stop();
      vibrate([40, 30, 80]);
    }
    return t < 1.25;
  }, signal);
  await sleep(1200, signal);
}
