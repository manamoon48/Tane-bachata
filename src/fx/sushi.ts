import { sfx, vibrate } from '../sound';
import type { Candidate } from '../types';
import { animate, h, sleep } from '../ui';
import type { FxContext } from './index';

const GAP = 120;
const PLATE_COLORS = ['#ffffff', '#ffd1dc', '#cde8ff', '#d7f5d0', '#fff1b8'];

/** 回転寿司：皿が流れてきて、「取る！」で目の前に当選の皿が止まる */
export async function sushi(ctx: FxContext): Promise<void> {
  const { stage, signal, winner, rarity, cands } = ctx;
  const W = Math.min(stage.clientWidth || window.innerWidth, 560);
  const belt = h('div', { class: 'sushi-belt' });
  const lane = h('div', { class: 'sushi-lane', style: `width:${W}px` }, [belt, h('div', { class: 'sushi-spot' })]);
  const chop = h('div', { class: 'sushi-chop' }, '🥢');
  const caption = h('div', { class: 'fx-caption' }, 'いい皿が来たら「取る！」');
  const btn = h('button', { class: 'slot-stop' }, '取る！');
  const scene = h('div', { class: 'fx-sushi' }, [h('div', { class: 'sushi-noren' }, [h('span', {}, '回'), h('span', {}, '転'), h('span', {}, '寿'), h('span', {}, '司')]), caption, h('div', { class: 'sushi-counter' }, [lane, chop]), btn]);
  stage.append(scene);

  // 皿は使い回し、グローバル番号ごとに中身を決める（当選皿だけ上書き）
  const shuffled = [...cands].sort(() => Math.random() - 0.5);
  const override = new Map<number, Candidate>();
  const contentOf = (i: number) => override.get(i) ?? shuffled[((i % shuffled.length) + shuffled.length) % shuffled.length];
  const poolSize = Math.ceil(W / GAP) + 3;
  const plates = Array.from({ length: poolSize }, () => {
    const el = h('div', { class: 'plate' }, [h('div', { class: 'plate-emoji' }), h('div', { class: 'plate-name' })]);
    belt.append(el);
    return { el, idx: NaN };
  });
  const center = W / 2;
  let offset = 0; // 何皿ぶん流れたか（左へ流れる）

  const paint = () => {
    const first = Math.floor(offset) - Math.ceil(center / GAP) - 1;
    plates.forEach((p, k) => {
      const i = first + k;
      const x = center + (i - offset) * GAP;
      p.el.style.transform = `translateX(${x - 48}px)`;
      if (p.idx !== i || override.has(i)) {
        p.idx = i;
        const c = contentOf(i);
        p.el.children[0].textContent = c.item.emoji;
        p.el.children[1].textContent = c.item.name;
        const special = override.has(i) && rarity !== 'normal';
        p.el.className = `plate ${special ? rarity : ''}`;
        p.el.style.setProperty('--plate', PLATE_COLORS[((i % 5) + 5) % 5]);
      }
    });
  };

  let speed = 2.4; // 皿/秒
  let stopped = false;
  let tPrev = performance.now();
  const loop = animate((now) => {
    const dt = Math.min(0.05, (now - tPrev) / 1000);
    tPrev = now;
    if (!stopped) offset += speed * dt;
    paint();
    return !stopped;
  }, signal);

  await new Promise<void>((resolve) => {
    const go = () => { clearTimeout(t); resolve(); };
    const t = setTimeout(go, 8000);
    btn.addEventListener('click', go, { once: true });
    signal.addEventListener('abort', go);
  });
  if (signal.aborted) return;
  btn.disabled = true;
  sfx.tap();
  caption.textContent = '…どれにしよう';

  // 画面外にある皿を当選に差し替えてから、そこへ向けて減速
  const target = Math.ceil(offset) + Math.ceil(center / GAP) + 3 + (rarity === 'normal' ? 0 : 2);
  override.set(target, winner);
  stopped = true;
  await loop;
  const from = offset;
  const dist = target - from;
  const dur = (3 * dist) / speed;
  const t0 = performance.now();
  let lastPlate = Math.floor(from);
  await animate((now) => {
    const t = Math.min(1, (now - t0) / 1000 / dur);
    offset = from + dist * (1 - (1 - t) ** 3);
    if (Math.floor(offset) !== lastPlate) {
      lastPlate = Math.floor(offset);
      sfx.tick();
    }
    if (t > 0.7 && rarity !== 'normal') caption.textContent = rarity === 'super' ? '光る皿が…！？' : '金の皿…！';
    paint();
    return t < 1;
  }, signal);
  if (signal.aborted) return;

  // お箸でひょいっと取る
  sfx.stop();
  vibrate(30);
  caption.textContent = '';
  const plate = plates.find((p) => p.idx === target)!.el;
  plate.classList.add('picked');
  chop.classList.add('grab');
  await sleep(500, signal);
  sfx.pop();
  plate.animate(
    [{ transform: plate.style.transform }, { transform: `${plate.style.transform} translateY(-70px) scale(1.5)` }],
    { duration: 500, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'forwards' },
  );
  caption.textContent = `${winner.item.name}、いただきます！`;
  await sleep(1300, signal);
}
