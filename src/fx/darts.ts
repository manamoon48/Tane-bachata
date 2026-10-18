import { sfx, vibrate } from '../sound';
import { animate, h, sleep } from '../ui';
import type { FxContext } from './index';

const TAU = Math.PI * 2;
const SPIN = 9; // 回転盤の角速度 (rad/s)
const FLIGHT = 0.6; // ダーツの飛行時間 (s)
const PALETTE = [
  ['#1f1a17', '#f3e3c3'],
  ['#c41f33', '#2f8a4a'],
];

interface Sector { a0: number; a1: number }

function drawBoard(cands: FxContext['cands'], secs: Sector[], size: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size * dpr;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const R = size / 2 - 6;
  g.translate(size / 2, size / 2);
  const ring = (r0: number, r1: number, a0: number, a1: number, color: string) => {
    g.beginPath();
    g.arc(0, 0, r1, a0, a1);
    g.arc(0, 0, r0, a1, a0, true);
    g.closePath();
    g.fillStyle = color;
    g.fill();
  };
  secs.forEach((s, i) => {
    ring(R * 0.14, R, s.a0, s.a1, PALETTE[0][i % 2]);
    ring(R * 0.9, R, s.a0, s.a1, PALETTE[1][i % 2]); // ダブルリング
    ring(R * 0.52, R * 0.58, s.a0, s.a1, PALETTE[1][(i + 1) % 2]); // トリプルリング
    const span = s.a1 - s.a0;
    if (span * R * 0.74 < 12) return;
    g.save();
    g.rotate((s.a0 + s.a1) / 2);
    g.translate(R * 0.74, 0);
    g.rotate(Math.PI / 2);
    g.font = `${Math.min(26, span * R * 0.5)}px system-ui, "Apple Color Emoji", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(cands[i].item.emoji, 0, 0);
    g.restore();
  });
  ring(0, R * 0.14, 0, TAU, '#2f8a4a');
  ring(0, R * 0.06, 0, TAU, '#c41f33');
  g.beginPath();
  g.arc(0, 0, R, 0, TAU);
  g.lineWidth = 6;
  g.strokeStyle = '#3a2a20';
  g.stroke();
  return c;
}

/** ダーツ：回転する的にタップで投げる。刺さった扇が当選 */
export async function darts(ctx: FxContext): Promise<void> {
  const { stage, signal, cands, winner, rarity } = ctx;
  const size = Math.min((stage.clientWidth || window.innerWidth) - 32, window.innerHeight * 0.5, 360);
  const R = size / 2 - 6;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  let a = 0;
  const secs = cands.map((c) => {
    const s = { a0: a, a1: a + c.prob * TAU };
    a = s.a1;
    return s;
  });
  const img = drawBoard(cands, secs, size, dpr);
  const winIdx = cands.indexOf(winner);

  const canvas = h('canvas', { class: 'dart-board', style: `width:${size}px;height:${size}px` });
  canvas.width = canvas.height = size * dpr;
  const g = canvas.getContext('2d')!;
  const aim = h('div', { class: 'dart-aim' });
  const stuck = h('div', { class: 'dart-stuck', style: `width:${size}px;height:${size}px` });
  const wrap = h('div', { class: 'dart-wrap', style: `width:${size}px;height:${size}px` }, [canvas, stuck, aim]);
  const caption = h('div', { class: 'fx-caption' }, '照準が合ったらタップで投げよう！');
  const scene = h('div', { class: 'fx-darts' }, [caption, wrap]);
  stage.append(scene);

  let rot = Math.random() * TAU;
  const paint = (hl = -1) => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.translate(canvas.width / 2, canvas.height / 2);
    g.rotate(rot);
    g.drawImage(img, -canvas.width / 2, -canvas.height / 2);
    if (hl >= 0) {
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, R * dpr, secs[hl].a0, secs[hl].a1);
      g.closePath();
      g.fillStyle = 'rgba(255,255,255,.5)';
      g.fill();
    }
  };

  // 照準は手ブレのように揺れる。盤は回り続ける
  let ax = 0, ay = 0;
  let thrown = false;
  const t0 = performance.now();
  let prev = t0;
  const aimLoop = animate((now) => {
    const t = (now - t0) / 1000;
    rot += SPIN * Math.min(0.05, (now - prev) / 1000);
    prev = now;
    ax = R * (0.5 * Math.sin(t * 1.3) + 0.15 * Math.sin(t * 3.7));
    ay = R * (0.45 * Math.cos(t * 1.1) + 0.15 * Math.sin(t * 4.3));
    aim.style.transform = `translate(${ax}px, ${ay}px)`;
    paint();
    return !thrown;
  }, signal);

  await new Promise<void>((resolve) => {
    const go = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(go, 8000);
    scene.addEventListener('pointerdown', go, { once: true });
    signal.addEventListener('abort', go);
  });
  thrown = true;
  await aimLoop;
  if (signal.aborted) return;
  caption.textContent = '';

  // 刺さる位置は照準どおり（中央のブルは避ける）
  let hr = Math.hypot(ax, ay);
  const ha = Math.atan2(ay, ax);
  hr = Math.min(R * 0.86, Math.max(R * 0.22, hr));
  const hx = Math.cos(ha) * hr, hy = Math.sin(ha) * hr;

  // 飛んでいる間に盤の速さをわずかに変え、当選の扇が刺さる位置に来るようにする
  const s = secs[winIdx];
  const local = s.a0 + (s.a1 - s.a0) * (0.25 + Math.random() * 0.5);
  const r0 = rot;
  const natural = r0 + SPIN * FLIGHT;
  let delta = (((ha - local - natural) % TAU) + TAU) % TAU;
  if (delta > Math.PI) delta -= TAU;

  const dart = h('div', { class: 'dart flying' }, h('i'));
  wrap.append(dart);
  aim.remove();
  sfx.start();
  const tf = performance.now();
  await animate((now) => {
    const u = Math.min(1, (now - tf) / 1000 / FLIGHT);
    const e = u * u * (3 - 2 * u);
    rot = r0 + SPIN * FLIGHT * u + delta * e;
    paint();
    const x = hx * u, y = (R + 140) * (1 - u) + hy * u;
    dart.style.transform = `translate(${x}px, ${y}px) scale(${2.2 - 1.2 * u})`;
    return u < 1;
  }, signal);
  if (signal.aborted) return;

  // 刺さった！ 盤ごと減速して止まる
  sfx.stop();
  vibrate(40);
  dart.remove();
  const pin = h('div', { class: 'dart' }, h('i'));
  pin.style.transform = `translate(${hx}px, ${hy}px)`;
  stuck.append(pin);
  const rImpact = rot;
  const td = performance.now();
  const decel = 2.4;
  await animate((now) => {
    const u = Math.min(1, (now - td) / 1000 / decel);
    rot = rImpact + ((SPIN * decel) / 2) * (1 - (1 - u) ** 2);
    paint();
    stuck.style.transform = `rotate(${rot - rImpact}rad)`;
    return u < 1;
  }, signal);
  if (signal.aborted) return;

  caption.textContent = `${winner.item.emoji} ${winner.item.name}！`;
  if (rarity !== 'normal') sfx.sparkle();
  for (let i = 0; i < 6; i++) {
    paint(i % 2 ? -1 : winIdx);
    await sleep(140, signal);
  }
  paint(winIdx);
  await sleep(300, signal);
}
