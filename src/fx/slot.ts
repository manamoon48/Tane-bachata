import { sfx, vibrate } from '../sound';
import type { Rarity } from '../types';
import { animate, choice, h, sleep } from '../ui';
import type { FxContext } from './index';

const FORTUNES = ['大吉', '中吉', '小吉', '吉', '末吉'];

function fortuneFor(r: Rarity): string {
  if (r === 'super') return '大吉';
  if (r === 'rare') return '中吉';
  return choice(['小吉', '吉', '末吉', '吉']);
}

interface Reel {
  el: HTMLElement;
  strip: HTMLElement;
  len: number;
  cellH: number;
  pos: number;
  speed: number;
  spinning: boolean;
}

function makeReel(cells: HTMLElement[], cellH: number, cls: string): Reel {
  const strip = h('div', { class: 'reel-strip' });
  // 3周分並べて継ぎ目なくループさせる
  for (let k = 0; k < 3; k++) cells.forEach((c) => strip.append(c.cloneNode(true)));
  const el = h('div', { class: `reel ${cls}`, style: `--cell:${cellH}px` }, strip);
  return { el, strip, len: cells.length, cellH, pos: Math.random() * cells.length, speed: 0, spinning: false };
}

function render(r: Reel): void {
  const p = ((r.pos % r.len) + r.len) % r.len + r.len;
  const winH = r.el.clientHeight || r.cellH * 1.7;
  r.strip.style.transform = `translateY(${-(p * r.cellH) + (winH - r.cellH) / 2}px)`;
  r.el.classList.toggle('blur', r.speed > 8);
}

/** 目標セルに向けて減速して止める。slip なら一つ手前で止まって「ずるっ」と滑り込む */
async function stopReel(r: Reel, target: number, minCells: number, exp: number, signal: AbortSignal, slip = false): Promise<void> {
  const cur = r.pos;
  let end = Math.ceil(cur) + minCells;
  end += (((target - end) % r.len) + r.len) % r.len;
  const firstEnd = slip ? end - 1 : end;
  const dist = firstEnd - cur;
  const v = Math.max(r.speed, 1);
  const dur = (exp * dist) / v; // 初速を今の速度に合わせる
  const t0 = performance.now();
  let lastCell = Math.floor(cur);
  await animate((now) => {
    const t = Math.min(1, (now - t0) / 1000 / dur);
    r.pos = cur + dist * (1 - (1 - t) ** exp);
    r.speed = v * (1 - t) ** (exp - 1);
    if (Math.floor(r.pos) !== lastCell) {
      lastCell = Math.floor(r.pos);
      if (r.speed < 12) sfx.tick();
    }
    render(r);
    return t < 1;
  }, signal);
  r.speed = 0;
  r.spinning = false;
  render(r);
  sfx.stop();
  vibrate(25);
  if (slip && !signal.aborted) {
    r.el.classList.add('bounce');
    await sleep(650, signal);
    const from = r.pos;
    const t1 = performance.now();
    await animate((now) => {
      const t = Math.min(1, (now - t1) / 260);
      r.pos = from + (1 - (1 - t) ** 2);
      render(r);
      return t < 1;
    }, signal);
    r.el.classList.remove('bounce');
    sfx.stop();
    vibrate([20, 30, 20]);
  }
}

export async function slot(ctx: FxContext): Promise<void> {
  const { stage, signal, winner, rarity } = ctx;
  const cats = [...new Set(ctx.cands.map((c) => c.item.category || 'その他'))];
  while (cats.length < 5) cats.push(...cats.slice(0, 5 - cats.length));
  const menus = [...ctx.cands];
  while (menus.length < 6) menus.push(...menus.slice(0, 6 - menus.length));

  const smallH = 56;
  const bigH = 96;
  const catReel = makeReel(cats.map((c) => h('div', { class: 'cell txt' }, c)), smallH, 'small');
  const fortReel = makeReel(FORTUNES.map((f) => h('div', { class: `cell txt fortune f-${FORTUNES.indexOf(f)}` }, f)), smallH, 'small');
  const menuReel = makeReel(
    menus.map((c) => h('div', { class: 'cell menu' }, [h('span', { class: 'emo' }, c.item.emoji), h('span', { class: 'nm' }, c.item.name)])),
    bigH,
    'big',
  );
  const reels = [catReel, fortReel, menuReel];

  const banner = h('div', { class: 'slot-banner' });
  const btn = h('button', { class: 'slot-stop' }, 'スタート');
  const machine = h('div', { class: 'slot-machine' }, [
    h('div', { class: 'slot-lamps' }, Array.from({ length: 9 }, () => h('i'))),
    h('div', { class: 'slot-row' }, [
      h('div', { class: 'reel-box' }, [h('div', { class: 'reel-label' }, 'ジャンル'), catReel.el]),
      h('div', { class: 'reel-box' }, [h('div', { class: 'reel-label' }, '運勢'), fortReel.el]),
    ]),
    h('div', { class: 'reel-box' }, [h('div', { class: 'reel-label' }, 'メニュー'), menuReel.el]),
    banner,
  ]);
  stage.append(h('div', { class: 'fx-slot' }, [machine, btn]));
  reels.forEach(render);

  // ボタン（または一定時間）で次のリールを止める
  const press = (label: string, autoMs: number) =>
    new Promise<void>((resolve) => {
      btn.textContent = label;
      btn.disabled = false;
      const done = () => {
        btn.disabled = true;
        btn.removeEventListener('click', done);
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, autoMs);
      btn.addEventListener('click', done);
      signal.addEventListener('abort', done);
    });

  await press('スタート', 60_000);
  if (signal.aborted) return;
  sfx.start();
  vibrate(20);
  reels.forEach((r) => { r.spinning = true; r.speed = 0; });
  let tPrev = performance.now();
  void animate((now) => {
    const dt = Math.min(0.05, (now - tPrev) / 1000);
    tPrev = now;
    for (const r of reels) {
      if (!r.spinning) continue;
      const max = r === menuReel ? 22 : 18;
      r.speed = Math.min(max, r.speed + 60 * dt);
      r.pos += r.speed * dt;
      render(r);
    }
    return reels.some((r) => r.spinning);
  }, signal);

  await sleep(500, signal);
  await press('STOP ①', 3500);
  if (signal.aborted) return;
  catReel.spinning = false;
  await stopReel(catReel, cats.indexOf(winner.item.category || 'その他'), 3, 2, signal);

  await press('STOP ②', 3500);
  if (signal.aborted) return;
  fortReel.spinning = false;
  const fortune = fortuneFor(rarity);
  await stopReel(fortReel, FORTUNES.indexOf(fortune), 3, 2, signal);

  // 運勢が予告になる
  const hot = rarity !== 'normal';
  banner.textContent = rarity === 'super' ? '激アツ！！' : rarity === 'rare' ? 'チャンス！' : 'リーチ！';
  banner.className = `slot-banner show ${rarity}`;
  machine.classList.add('reach');
  sfx.reach();

  await press('STOP ③', 4000);
  if (signal.aborted) return;
  menuReel.spinning = false;
  const beat = setInterval(() => sfx.heartbeat(), 700);
  const slip = Math.random() < (hot ? 0.5 : 0.3);
  try {
    await stopReel(menuReel, menus.indexOf(winner), hot ? 12 : 8, 3, signal, slip);
  } finally {
    clearInterval(beat);
  }
  machine.classList.remove('reach');
  banner.textContent = '決定！';
  banner.className = `slot-banner show win ${rarity}`;
  menuReel.el.classList.add('win');
  await sleep(1000, signal);
}
