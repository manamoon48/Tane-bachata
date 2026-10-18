import { sampleWeighted } from '../lottery';
import { sfx, vibrate } from '../sound';
import type { Candidate } from '../types';
import { h, sleep } from '../ui';
import type { FxContext } from './index';

const COUNT = 3;
const SWAPS = 9;

function face(c: Candidate): HTMLElement[] {
  return [h('span', { class: 'pcard-emoji' }, c.item.emoji), h('span', { class: 'pcard-name' }, c.item.name)];
}

/** カードめくり：伏せてシャッフルし、選んだ1枚が当選。残りは「選ばなかった世界線」 */
export async function cards(ctx: FxContext): Promise<void> {
  const { stage, signal, cands, winner, rarity } = ctx;
  const picks = sampleWeighted(cands, COUNT, winner).sort(() => Math.random() - 0.5);
  const n = picks.length;
  const gap = Math.min(116, ((stage.clientWidth || window.innerWidth) - 24) / n);

  const els = picks.map((c) =>
    h('button', { class: 'pcard flipped' }, [h('div', { class: 'pcard-front' }, face(c)), h('div', { class: 'pcard-back' }, h('span', {}, '?'))]),
  );
  // slot[i] = カード i が今いる位置
  const slot = els.map((_, i) => i);
  const place = () => els.forEach((el, i) => { el.style.transform = `translateX(${(slot[i] - (n - 1) / 2) * gap}px)`; });
  const table = h('div', { class: 'pcard-table' }, els);
  const caption = h('div', { class: 'fx-caption' }, 'この中から…');
  stage.append(h('div', { class: 'fx-cards' }, [caption, table]));
  place();

  // 表を見せてから伏せる
  await sleep(300, signal);
  els.forEach((el) => el.classList.remove('flipped'));
  sfx.paper();
  await sleep(1400, signal);
  if (signal.aborted) return;
  caption.textContent = 'シャッフル！';
  els.forEach((el) => el.classList.add('flipped'));
  sfx.paper();
  await sleep(700, signal);

  table.classList.add('shuffling');
  for (let k = 0; k < SWAPS && !signal.aborted; k++) {
    const a = Math.floor(Math.random() * n);
    let b = Math.floor(Math.random() * (n - 1));
    if (b >= a) b++;
    [slot[a], slot[b]] = [slot[b], slot[a]];
    els[a].classList.add('lift');
    place();
    sfx.tick();
    await sleep(k < 3 ? 380 : 240, signal);
    els[a].classList.remove('lift');
  }
  table.classList.remove('shuffling');
  if (signal.aborted) return;
  caption.textContent = '1枚選んでね';
  table.classList.add('ready');

  const chosen = await new Promise<number>((resolve) => {
    const timer = setTimeout(() => resolve(Math.floor(Math.random() * n)), 8000);
    els.forEach((el, i) => el.addEventListener('click', () => { clearTimeout(timer); resolve(i); }, { once: true }));
    signal.addEventListener('abort', () => resolve(0));
  });
  if (signal.aborted) return;
  table.classList.remove('ready');

  // 選んだカードの表を当選に、残りを他の候補にする
  const rest = picks.filter((c) => c !== winner);
  els.forEach((el, i) => {
    el.querySelector('.pcard-front')!.replaceChildren(...face(i === chosen ? winner : rest.pop()!));
  });
  const pick = els[chosen];
  pick.classList.add('chosen', rarity);
  pick.style.transform += ' translateY(-14px) scale(1.18)';
  caption.textContent = '';
  sfx.tap();
  await sleep(500, signal);
  pick.classList.remove('flipped');
  sfx.pop();
  vibrate([30, 40, 60]);
  caption.textContent = `${winner.item.emoji} ${winner.item.name}！`;
  await sleep(1200, signal);

  // 選ばなかった世界線
  els.forEach((el, i) => {
    if (i === chosen) return;
    el.classList.add('other');
    el.classList.remove('flipped');
  });
  table.append(h('div', { class: 'pcard-other-label' }, '選ばなかった世界線…'));
  sfx.paper();
  await sleep(1000, signal);
}
