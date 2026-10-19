import { sampleWeighted } from '../lottery';
import { sfx, vibrate } from '../sound';
import type { Candidate } from '../types';
import { animate, h, sleep } from '../ui';
import type { FxContext } from './index';

const MAX_COLS = 6;
const LEVELS = 9;

export interface Amida {
  cols: number;
  /** rungs[level] = 横線の左端の列番号の一覧 */
  rungs: number[][];
}

/** 横線をランダムに引く。同じ段で隣り合う横線は作らない */
export function makeAmida(cols: number, rnd = Math.random): Amida {
  const rungs: number[][] = [];
  for (let l = 0; l < LEVELS; l++) {
    const row: number[] = [];
    for (let j = 0; j < cols - 1; j++) {
      if (row.includes(j - 1)) continue;
      if (rnd() < 0.45) row.push(j);
    }
    rungs.push(row);
  }
  return { cols, rungs };
}

/** start 列からたどった道筋（列番号の列）と、たどり着く列 */
export function trace(a: Amida, start: number): { path: number[]; end: number } {
  let c = start;
  const path = [c];
  for (const row of a.rungs) {
    if (row.includes(c - 1)) c -= 1;
    else if (row.includes(c)) c += 1;
    path.push(c);
  }
  return { path, end: c };
}

/** あみだくじ：スタートを選ぶと光がたどり、行き着いた先が当選 */
export async function amida(ctx: FxContext): Promise<void> {
  const { stage, signal, cands, winner, rarity } = ctx;
  const picks = sampleWeighted(cands, MAX_COLS, winner);
  const n = picks.length;
  const W = Math.min((stage.clientWidth || window.innerWidth) - 16, 420);
  const H = Math.min(window.innerHeight * 0.48, 380);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const colX = (j: number) => (W / n) * (j + 0.5);
  const levelY = (l: number) => 14 + ((H - 28) / (LEVELS + 1)) * (l + 1);

  const a = makeAmida(n);
  const canvas = h('canvas', { class: 'amida', style: `width:${W}px;height:${H}px` });
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);

  const starts = h('div', { class: 'amida-row', style: `width:${W}px` });
  const goals = h('div', { class: 'amida-row', style: `width:${W}px` });
  const goalEls: HTMLElement[] = [];
  for (let j = 0; j < n; j++) {
    starts.append(h('button', { class: 'amida-start', 'data-col': String(j) }, String(j + 1)));
    const el = h('div', { class: 'amida-goal' }, [h('div', { class: 'amida-cover' }, '？'), h('div', { class: 'amida-face' })]);
    goals.append(el);
    goalEls.push(el);
  }
  const caption = h('div', { class: 'fx-caption' }, '線を引いています…');
  stage.append(h('div', { class: 'fx-amida' }, [caption, starts, canvas, goals]));

  let shown = 0; // 描き終えた横線の数
  const all = a.rungs.flatMap((row, l) => row.map((j) => ({ l, j })));
  const draw = (trail: { x: number; y: number }[] = []) => {
    g.clearRect(0, 0, W, H);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,.85)';
    g.lineWidth = 3;
    for (let j = 0; j < n; j++) {
      g.beginPath();
      g.moveTo(colX(j), 0);
      g.lineTo(colX(j), H);
      g.stroke();
    }
    all.slice(0, shown).forEach(({ l, j }) => {
      g.beginPath();
      g.moveTo(colX(j), levelY(l));
      g.lineTo(colX(j + 1), levelY(l));
      g.stroke();
    });
    if (trail.length > 1) {
      g.strokeStyle = rarity === 'super' ? '#ff8fc2' : '#ffd84a';
      g.lineWidth = 6;
      g.shadowColor = g.strokeStyle;
      g.shadowBlur = 12;
      g.beginPath();
      g.moveTo(trail[0].x, trail[0].y);
      trail.forEach((p) => g.lineTo(p.x, p.y));
      g.stroke();
      const last = trail[trail.length - 1];
      g.beginPath();
      g.arc(last.x, last.y, 7, 0, Math.PI * 2);
      g.fillStyle = '#fff';
      g.fill();
      g.shadowBlur = 0;
    }
  };

  // 横線を順番に引いていく
  for (shown = 0; shown <= all.length && !signal.aborted; shown++) {
    draw();
    if (shown) sfx.tick();
    await sleep(60, signal);
  }
  shown = all.length;
  draw();
  if (signal.aborted) return;
  caption.textContent = 'スタートを選んでね';
  starts.classList.add('ready');

  const start = await new Promise<number>((resolve) => {
    const timer = setTimeout(() => resolve(Math.floor(Math.random() * n)), 8000);
    starts.addEventListener('click', (e) => {
      const col = (e.target as HTMLElement).closest<HTMLElement>('.amida-start')?.dataset.col;
      if (col === undefined) return;
      clearTimeout(timer);
      resolve(Number(col));
    });
    signal.addEventListener('abort', () => resolve(0));
  });
  if (signal.aborted) return;
  starts.classList.remove('ready');
  starts.children[start].classList.add('on');
  caption.textContent = '';
  sfx.tap();

  // たどり着く先に当選を置き、残りは他の枠へ
  const { path, end } = trace(a, start);
  const others = picks.filter((c) => c !== winner).sort(() => Math.random() - 0.5);
  const slots: Candidate[] = [];
  for (let j = 0; j < n; j++) slots.push(j === end ? winner : others.pop()!);
  slots.forEach((c, j) => {
    goalEls[j].querySelector('.amida-face')!.replaceChildren(h('span', { class: 'amida-emoji' }, c.item.emoji), h('span', { class: 'amida-name' }, c.item.name));
  });

  // 道筋の折れ点を作って一定速度でたどる
  const pts = [{ x: colX(start), y: 0 }];
  path.slice(1).forEach((c, l) => {
    pts.push({ x: colX(path[l]), y: levelY(l) });
    if (c !== path[l]) pts.push({ x: colX(c), y: levelY(l) });
  });
  pts.push({ x: colX(end), y: H });
  const segs = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  const total = segs.reduce((s, d) => s + d, 0);
  const speed = total / 3.2; // 約3秒でたどり着く
  const t0 = performance.now();
  let lastSeg = -1;
  await animate((now) => {
    const travelled = ((now - t0) / 1000) * speed;
    let dist = Math.min(total, travelled);
    const trail = [pts[0]];
    let i = 0;
    for (; i < segs.length && dist > segs[i]; i++) {
      dist -= segs[i];
      trail.push(pts[i + 1]);
    }
    if (i < segs.length) {
      const f = dist / segs[i];
      trail.push({ x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f });
    }
    if (i !== lastSeg) {
      lastSeg = i;
      sfx.tick();
    }
    draw(trail);
    // 区間長の足し引きは丸め誤差で最後の区間を抜けきれないことがあるので、進んだ距離で終了を判定する
    return travelled < total;
  }, signal);
  if (signal.aborted) return;

  sfx.pop();
  vibrate([30, 40, 30]);
  goalEls[end].classList.add('open', 'win');
  caption.textContent = `${winner.item.emoji} ${winner.item.name}！`;
  await sleep(900, signal);
  // 他の行き先もめくって見せる
  for (let j = 0; j < n; j++) {
    if (j === end) continue;
    goalEls[j].classList.add('open');
    await sleep(120, signal);
  }
  await sleep(500, signal);
}
