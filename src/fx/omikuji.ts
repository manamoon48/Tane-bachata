import { sfx, vibrate } from '../sound';
import type { Rarity } from '../types';
import { choice, h, randInt, sleep } from '../ui';
import type { FxContext } from './index';

const NORMAL = ['吉', '中吉', '小吉', '末吉'];
const LINES: Record<Rarity, string[]> = {
  super: ['食運：天井知らず', '待ち人：満腹で来る', '願い事：すべて叶う', '箸運：最強'],
  rare: ['食運：上々', '待ち人：お腹を空かせて来る', '願い事：概ね叶う', '箸運：良し'],
  normal: ['食運：穏やか', '待ち人：ほどなく来る', '願い事：腹八分目に', '箸運：まずまず'],
};

function fortune(r: Rarity): string {
  return r === 'super' ? '大吉' : r === 'rare' ? choice(['大吉', '中吉']) : choice(NORMAL);
}

type MotionWithPermission = typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

/** 振る（端末を振る or 筒をタップ）と回数が貯まり、規定回数で resolve */
function waitShake(box: HTMLElement, btn: HTMLButtonElement, need: number, signal: AbortSignal, onShake: (n: number) => void): Promise<void> {
  return new Promise((resolve) => {
    let n = 0;
    let lastAt = 0;
    let done = false;
    const shake = () => {
      const now = performance.now();
      if (done || now - lastAt < 250) return;
      lastAt = now;
      n++;
      onShake(n);
      box.classList.remove('shake');
      void box.offsetWidth;
      box.classList.add('shake');
      if (n >= need) finish();
    };
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.acceleration ?? e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
      if (mag > (e.acceleration ? 14 : 24)) shake();
    };
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('devicemotion', onMotion);
      resolve();
    };
    box.addEventListener('click', shake);
    // iOS はユーザー操作の中でモーションの許可を求める必要がある
    btn.addEventListener('click', async () => {
      const DME = window.DeviceMotionEvent as MotionWithPermission | undefined;
      try {
        if (DME?.requestPermission && (await DME.requestPermission()) !== 'granted') return;
      } catch {
        return;
      }
      window.addEventListener('devicemotion', onMotion);
      btn.textContent = '📳 振ってね！';
      btn.disabled = true;
    });
    signal.addEventListener('abort', finish);
  });
}

/** おみくじ：筒を振って棒を出し、巻物を開く */
export async function omikuji(ctx: FxContext): Promise<void> {
  const { stage, signal, rarity, winner } = ctx;
  const no = randInt(1, 100);
  const stick = h('div', { class: 'kuji-stick' }, h('span', {}, `第${no}番`));
  const box = h('div', { class: 'kuji-box' }, [stick, h('div', { class: 'kuji-body' }, [h('span', {}, '御'), h('span', {}, '神'), h('span', {}, '籤')])]);
  const caption = h('div', { class: 'fx-caption' }, '筒をタップして振ってね（3回）');
  const motionBtn = h('button', { class: 'kuji-motion' }, '📳 スマホを振って引く');
  const scene = h('div', { class: 'fx-kuji' }, [caption, box, motionBtn]);
  stage.append(scene);

  await waitShake(box, motionBtn, 3, signal, (n) => {
    sfx.rattle();
    vibrate(30);
    caption.textContent = ['', 'シャカ…', 'シャカシャカ…', 'えいっ！'][n] ?? '';
  });
  if (signal.aborted) return;
  motionBtn.remove();

  // 筒を逆さにして棒を出す
  box.classList.remove('shake');
  box.classList.add('flip');
  await sleep(700, signal);
  stick.classList.add('out');
  sfx.drop();
  await sleep(900, signal);
  caption.textContent = `第${no}番`;
  await sleep(600, signal);

  // 巻物
  const f = fortune(rarity);
  const lines = LINES[rarity];
  const paper = h('div', { class: `kuji-paper ${rarity}` }, [
    h('div', { class: 'kuji-col head' }, `第${no}番`),
    // 大きな運勢は縦書きのグリフ幅に依存しないよう1文字ずつ積む
    h('div', { class: `kuji-col luck ${f === '大吉' ? 'daikichi' : ''}` }, [...f].map((ch) => h('span', {}, ch))),
    h('div', { class: 'kuji-col menu' }, [h('span', { class: 'kuji-emoji' }, winner.item.emoji), winner.item.name]),
    ...lines.map((l) => h('div', { class: 'kuji-col small' }, l)),
  ]);
  box.classList.add('away');
  caption.textContent = '';
  scene.append(paper);
  sfx.paper();
  await sleep(1200, signal);
  if (f === '大吉') {
    sfx.sparkle();
    vibrate([40, 40, 80]);
  }
  await sleep(1400, signal);
}
