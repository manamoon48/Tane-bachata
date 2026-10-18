import type { Rarity } from '../types';
import { animate, h, rand } from '../ui';

interface P {
  x: number; y: number; vx: number; vy: number; r: number; vr: number;
  w: number; hgt: number; color: string; emoji?: string; life: number;
}

const COLORS = ['#ff6b4a', '#ffc94a', '#4ad6a6', '#4aa8ff', '#c56bff', '#ff8fc2'];
const GOLD = ['#ffd84a', '#ffe98a', '#f5b700', '#fff3c4'];

/** 紙吹雪（超レアは料理の絵文字も降らせる） */
export function confetti(rarity: Rarity, emoji: string): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const canvas = h('canvas', { class: 'confetti' });
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  document.body.append(canvas);
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);

  const palette = rarity === 'rare' ? GOLD : COLORS;
  const count = rarity === 'super' ? 160 : rarity === 'rare' ? 120 : 80;
  const ps: P[] = [];
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0;
    ps.push({
      x: side ? -10 : W + 10,
      y: H * rand(0.45, 0.8),
      vx: (side ? 1 : -1) * rand(3, 9),
      vy: rand(-14, -6),
      r: rand(0, Math.PI * 2),
      vr: rand(-0.3, 0.3),
      w: rand(6, 10),
      hgt: rand(8, 14),
      color: palette[i % palette.length],
      life: 1,
    });
  }
  if (rarity === 'super') {
    for (let i = 0; i < 26; i++) {
      ps.push({ x: rand(0, W), y: rand(-H, -20), vx: rand(-1, 1), vy: rand(1, 3), r: rand(-0.5, 0.5), vr: rand(-0.05, 0.05), w: rand(26, 40), hgt: 0, color: '', emoji, life: 1 });
    }
  }
  const start = performance.now();
  void animate((now) => {
    const t = (now - start) / 1000;
    g.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.vy += p.emoji ? 0.08 : 0.35;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      if (t > 2.4) p.life -= 0.02;
      g.save();
      g.globalAlpha = Math.max(0, p.life);
      g.translate(p.x, p.y);
      g.rotate(p.r);
      if (p.emoji) {
        g.font = `${p.w}px system-ui, "Apple Color Emoji", sans-serif`;
        g.textAlign = 'center';
        g.fillText(p.emoji, 0, 0);
      } else {
        g.fillStyle = p.color;
        g.fillRect(-p.w / 2, -p.hgt / 2, p.w, p.hgt * Math.abs(Math.cos(p.r * 2)) + 2);
      }
      g.restore();
    }
    if (t > 4) {
      canvas.remove();
      return false;
    }
  });
}
