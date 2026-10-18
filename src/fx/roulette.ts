import { sfx, vibrate } from '../sound';
import { animate, h, rand, sleep } from '../ui';
import type { FxContext } from './index';

const COLORS = ['#ff6b4a', '#ffc94a', '#4ad6a6', '#4aa8ff', '#c56bff', '#ff8fc2', '#ff9f43', '#7bd389'];
const TAU = Math.PI * 2;
const POINTER = -Math.PI / 2; // 針は真上

interface Sector { a0: number; a1: number; color: string }

function sectors(probs: number[]): Sector[] {
  let a = 0;
  return probs.map((p, i) => {
    const s = { a0: a, a1: a + p * TAU, color: COLORS[i % COLORS.length] };
    a = s.a1;
    // 最後と最初が同じ色にならないようにずらす
    if (i === probs.length - 1 && i % COLORS.length === 0 && i > 0) s.color = COLORS[3];
    return s;
  });
}

function drawWheel(ctx: FxContext, size: number, dpr: number, secs: Sector[]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size * dpr;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const R = size / 2;
  g.translate(R, R);
  const r = R - 6;
  ctx.cands.forEach((cand, i) => {
    const s = secs[i];
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, r, s.a0, s.a1);
    g.closePath();
    g.fillStyle = s.color;
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.85)';
    g.lineWidth = ctx.cands.length > 30 ? 0.5 : 2;
    g.stroke();

    const span = s.a1 - s.a0;
    const arc = span * r * 0.62; // ラベル位置での弧の長さ
    if (arc < 9) return;
    g.save();
    g.rotate((s.a0 + s.a1) / 2);
    g.textBaseline = 'middle';
    g.textAlign = 'right';
    const fs = Math.min(18, Math.max(9, arc * 0.7));
    g.font = `${fs + 4}px system-ui, "Apple Color Emoji", sans-serif`;
    g.fillText(cand.item.emoji, r - 10, 0);
    if (arc >= 13) {
      g.font = `bold ${Math.min(15, fs)}px system-ui, sans-serif`;
      g.fillStyle = '#fff';
      g.shadowColor = 'rgba(0,0,0,.35)';
      g.shadowBlur = 3;
      const name = cand.item.name.length > 7 ? cand.item.name.slice(0, 6) + '…' : cand.item.name;
      g.fillText(name, r - 14 - (fs + 4) * 1.2, 0);
    }
    g.restore();
  });
  // 外枠と飾りの電球
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.lineWidth = 6;
  g.strokeStyle = '#3a2a20';
  g.stroke();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    g.beginPath();
    g.arc(Math.cos(a) * r, Math.sin(a) * r, 2.4, 0, TAU);
    g.fillStyle = i % 2 ? '#fff6c8' : '#ffd84a';
    g.fill();
  }
  return c;
}

function sectorAt(secs: Sector[], rot: number): number {
  const local = (((POINTER - rot) % TAU) + TAU) % TAU;
  const i = secs.findIndex((s) => local >= s.a0 && local < s.a1);
  return i < 0 ? secs.length - 1 : i;
}

export async function roulette(ctx: FxContext): Promise<void> {
  const { stage, signal } = ctx;
  const size = Math.min(window.innerWidth - 32, window.innerHeight * 0.5, 380);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const secs = sectors(ctx.cands.map((c) => c.prob));
  const wheelImg = drawWheel(ctx, size, dpr, secs);
  const winIdx = ctx.cands.indexOf(ctx.winner);

  const canvas = h('canvas', { class: 'wheel', style: `width:${size}px;height:${size}px` });
  canvas.width = canvas.height = size * dpr;
  const g = canvas.getContext('2d')!;
  const pointer = h('div', { class: 'wheel-pointer' });
  const hub = h('div', { class: 'wheel-hub' }, '?');
  const label = h('div', { class: 'fx-caption' }, 'スワイプかタップで回そう！');
  const wrap = h('div', { class: 'wheel-wrap', style: `width:${size}px;height:${size}px` }, [canvas, pointer, hub]);
  stage.append(h('div', { class: 'fx-roulette' }, [label, wrap]));

  let rot = rand(0, TAU);
  const paint = (highlight = -1, on = false) => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.translate(canvas.width / 2, canvas.height / 2);
    g.rotate(rot);
    g.drawImage(wheelImg, -canvas.width / 2, -canvas.height / 2);
    if (highlight >= 0) {
      const s = secs[highlight];
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, (size / 2 - 6) * dpr, s.a0, s.a1);
      g.closePath();
      g.fillStyle = on ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.0)';
      g.fill();
    }
  };
  paint();

  // 待機中はゆっくり回り、スワイプの勢いで回転数が変わる
  const power = await new Promise<number>((resolve) => {
    let y0 = 0, x0 = 0, t0 = 0, done = false;
    const finish = (p: number) => {
      if (done) return;
      done = true;
      resolve(p);
    };
    canvas.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; t0 = performance.now(); });
    canvas.addEventListener('pointerup', (e) => {
      const dist = Math.hypot(e.clientX - x0, e.clientY - y0);
      const dt = Math.max(16, performance.now() - t0);
      finish(Math.min(1, dist / dt / 2.5));
    });
    wrap.addEventListener('click', (e) => { if (e.target !== canvas) finish(0.3); });
    signal.addEventListener('abort', () => finish(0));
    void animate(() => {
      if (done) return false;
      rot += 0.004;
      paint();
    }, signal);
  });
  if (signal.aborted) return;

  label.textContent = '';
  sfx.start();
  vibrate(20);

  // 焦らし: 35% の確率で扇の端ギリギリに止める
  const tease = Math.random() < 0.35;
  const f = tease ? (Math.random() < 0.5 ? rand(0.02, 0.07) : rand(0.93, 0.98)) : rand(0.2, 0.8);
  const s = secs[winIdx];
  const target = s.a0 + (s.a1 - s.a0) * f;
  const spins = 5 + Math.round(power * 5);
  const base = POINTER - target;
  const end = base + Math.ceil((rot - base) / TAU) * TAU + spins * TAU;
  const startRot = rot;
  const dur = (tease ? 9750 : 7200) + power * 1200;
  const exp = tease ? 5 : 4;
  let last = sectorAt(secs, rot);
  const t0 = performance.now();

  await animate((now) => {
    const t = Math.min(1, (now - t0) / dur);
    rot = startRot + (end - startRot) * (1 - (1 - t) ** exp);
    paint();
    const cur = sectorAt(secs, rot);
    if (cur !== last) {
      last = cur;
      sfx.tick();
      pointer.classList.remove('flick');
      void pointer.offsetWidth;
      pointer.classList.add('flick');
    }
    if (t > 0.85 && tease && !label.textContent) label.textContent = 'ギリギリ…！？';
    return t < 1;
  }, signal);
  if (signal.aborted) return;

  sfx.stop();
  vibrate([30, 40, 30]);
  hub.textContent = ctx.winner.item.emoji;
  hub.classList.add('win');
  label.textContent = ctx.winner.item.name;
  for (let i = 0; i < 6; i++) {
    paint(winIdx, i % 2 === 0);
    await sleep(120, signal);
  }
  paint(winIdx, true);
  await sleep(400, signal);
}
