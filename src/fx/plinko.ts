import { sfx, vibrate } from '../sound';
import { h, rand, sleep, animate } from '../ui';
import type { FxContext } from './index';

interface Board {
  W: number;
  H: number;
  pegs: { x: number; y: number }[];
  slots: { x0: number; x1: number }[];
  slotTop: number;
}
interface Frame { x: number; y: number; hit: number }

const R = 7; // 玉の半径
const PR = 4; // ピンの半径

export function makeBoard(W: number, H: number, probs: number[]): Board {
  const pegs: { x: number; y: number }[] = [];
  const rows = 9;
  const top = 70;
  const slotTop = H - 70;
  const gapY = (slotTop - top - 30) / (rows - 1);
  const gapX = W / 8;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? gapX / 2 : 0;
    for (let x = off + gapX / 2; x < W - 4; x += gapX) pegs.push({ x, y: top + r * gapY });
  }
  // 幅は確率に比例（細すぎる枠は最低幅を確保）
  const minW = Math.min(14, W / probs.length);
  const raw = probs.map((p) => Math.max(minW, p * W));
  const scale = W / raw.reduce((a, b) => a + b, 0);
  let x = 0;
  const slots = raw.map((w) => {
    const s = { x0: x, x1: x + w * scale };
    x = s.x1;
    return s;
  });
  return { W, H, pegs, slots, slotTop };
}

/** 固定ステップで物理を回し、軌跡を記録する。steer>0 なら目標枠へ少しずつ寄せる */
function simulate(b: Board, x0: number, seed: number, target: number, steer: number): { frames: Frame[]; slot: number } {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let x = x0, y = 20, vx = (rnd() - 0.5) * 30, vy = 0;
  const g = 900, dt = 1 / 120;
  const frames: Frame[] = [];
  const tx = (b.slots[target].x0 + b.slots[target].x1) / 2;
  let slot = -1;
  for (let i = 0; i < 2400; i++) {
    let hit = 0;
    vy += g * dt;
    if (steer && y > b.H * 0.25 && y < b.slotTop) vx += (tx - x) * steer * dt;
    x += vx * dt;
    y += vy * dt;
    for (const p of b.pegs) {
      const dx = x - p.x, dy = y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < R + PR) {
        const nx = dx / d, ny = dy / d;
        x = p.x + nx * (R + PR);
        y = p.y + ny * (R + PR);
        const dot = vx * nx + vy * ny;
        if (dot < 0) {
          vx = (vx - 1.5 * dot * nx) * 0.85 + (rnd() - 0.5) * 40;
          vy = (vy - 1.5 * dot * ny) * 0.85;
          hit = 1;
        }
      }
    }
    if (x < R) { x = R; vx = Math.abs(vx) * 0.6; hit = 1; }
    if (x > b.W - R) { x = b.W - R; vx = -Math.abs(vx) * 0.6; hit = 1; }
    if (y > b.slotTop) {
      if (slot < 0) slot = Math.max(0, b.slots.findIndex((sl) => x >= sl.x0 && x < sl.x1));
      const sl = b.slots[slot];
      if (x < sl.x0 + R) { x = sl.x0 + R; vx = Math.abs(vx) * 0.4; }
      if (x > sl.x1 - R) { x = sl.x1 - R; vx = -Math.abs(vx) * 0.4; }
      if (sl.x1 - sl.x0 < 2 * R) x = (sl.x0 + sl.x1) / 2;
    }
    if (y > b.H - R) {
      y = b.H - R;
      if (Math.abs(vy) < 60) {
        frames.push({ x, y, hit });
        break;
      }
      vy = -vy * 0.35;
      hit = 1;
    }
    frames.push({ x, y, hit });
  }
  return { frames, slot };
}

/** 結果が target になる軌跡を探す（素の物理で見つからなければ少しだけ誘導） */
export function findPath(b: Board, x0: number, target: number): Frame[] {
  for (let i = 0; i < 300; i++) {
    const r = simulate(b, x0 + (i ? rand(-4, 4) : 0), 1 + i * 7919, target, 0);
    if (r.slot === target) return r.frames;
  }
  for (const k of [2, 4, 8, 16, 32]) {
    for (let i = 0; i < 40; i++) {
      const r = simulate(b, x0, 99 + i * 31, target, k);
      if (r.slot === target) return r.frames;
    }
  }
  // 最終手段: 目標枠の真上から落とす
  return simulate(b, (b.slots[target].x0 + b.slots[target].x1) / 2, 7, target, 64).frames;
}

export async function plinko(ctx: FxContext): Promise<void> {
  const { stage, signal, winner, cands, rarity } = ctx;
  const W = Math.min((stage.clientWidth || window.innerWidth) - 8, 400);
  const H = Math.min(window.innerHeight * 0.62, 520);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const board = makeBoard(W, H, cands.map((c) => c.prob));
  const target = cands.indexOf(winner);

  const canvas = h('canvas', { class: 'plinko', style: `width:${W}px;height:${H}px` });
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  const caption = h('div', { class: 'fx-caption' }, '上をタップして玉を落とそう');
  stage.append(h('div', { class: 'fx-plinko' }, [caption, canvas]));

  const COLORS = ['#ff6b4a', '#ffc94a', '#4ad6a6', '#4aa8ff', '#c56bff', '#ff8fc2', '#ff9f43', '#7bd389'];
  const flash = new Map<number, number>();
  const draw = (ball: { x: number; y: number } | null, highlight = -1) => {
    g.clearRect(0, 0, W, H);
    // 受け口
    board.slots.forEach((sl, i) => {
      g.fillStyle = COLORS[i % COLORS.length];
      g.globalAlpha = i === highlight ? 1 : 0.75;
      g.fillRect(sl.x0, board.slotTop, sl.x1 - sl.x0, H - board.slotTop);
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.fillRect(sl.x0 - 1, board.slotTop, 2, H - board.slotTop);
      const w = sl.x1 - sl.x0;
      if (w >= 16) {
        g.font = `${Math.min(22, w * 0.8)}px system-ui, "Apple Color Emoji", sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(cands[i].item.emoji, (sl.x0 + sl.x1) / 2, H - 24);
      }
    });
    // ピン
    board.pegs.forEach((p, i) => {
      const f = flash.get(i) ?? 0;
      g.beginPath();
      g.arc(p.x, p.y, PR + f * 2, 0, Math.PI * 2);
      g.fillStyle = f > 0 ? '#fff6c8' : 'rgba(255,255,255,.8)';
      g.fill();
    });
    if (ball) {
      g.beginPath();
      g.arc(ball.x, ball.y, R, 0, Math.PI * 2);
      const grad = g.createRadialGradient(ball.x - 2, ball.y - 3, 1, ball.x, ball.y, R);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(1, rarity === 'super' ? '#c56bff' : rarity === 'rare' ? '#f5b700' : '#cfd8e3');
      g.fillStyle = grad;
      g.shadowColor = rarity === 'normal' ? 'transparent' : '#ffd84a';
      g.shadowBlur = rarity === 'normal' ? 0 : 14;
      g.fill();
      g.shadowBlur = 0;
    }
  };

  // ガイドの玉を左右に揺らしながら、タップ位置で落とす
  let aimX = W / 2;
  const start = performance.now();
  const x0 = await new Promise<number>((resolve) => {
    let done = false;
    const go = (x: number) => { if (!done) { done = true; resolve(x); } };
    canvas.addEventListener('pointerdown', (e) => {
      const r = canvas.getBoundingClientRect();
      go(Math.max(R, Math.min(W - R, e.clientX - r.left)));
    });
    signal.addEventListener('abort', () => go(aimX));
    setTimeout(() => go(aimX), 8000);
    void animate((now) => {
      if (done) return false;
      aimX = W / 2 + Math.sin((now - start) / 500) * W * 0.35;
      draw({ x: aimX, y: 20 });
    }, signal);
  });
  if (signal.aborted) return;
  caption.textContent = '';
  sfx.drop();

  const frames = findPath(board, x0, target);
  const t0 = performance.now();
  let fi = 0;
  await animate((now) => {
    const want = Math.min(frames.length - 1, Math.floor(((now - t0) / 1000) * 120));
    for (; fi <= want; fi++) {
      const f = frames[fi];
      if (f.hit) {
        sfx.peg(1 + (f.y / H) * 0.8);
        const pi = board.pegs.findIndex((p) => Math.hypot(p.x - f.x, p.y - f.y) < R + PR + 2);
        if (pi >= 0) flash.set(pi, 1);
      }
    }
    for (const [k, v] of flash) v <= 0.05 ? flash.delete(k) : flash.set(k, v * 0.85);
    draw(frames[want]);
    return want < frames.length - 1;
  }, signal);
  if (signal.aborted) return;

  sfx.stop();
  vibrate([30, 40, 30]);
  caption.textContent = `${winner.item.emoji} ${winner.item.name}！`;
  const last = frames[frames.length - 1];
  for (let i = 0; i < 6; i++) {
    draw(last, i % 2 ? -1 : target);
    await sleep(140, signal);
  }
  draw(last, target);
  await sleep(500, signal);
}
