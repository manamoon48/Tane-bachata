import { confetti } from '../fx/confetti';
import { EFFECT_IDS, EFFECTS } from '../fx/index';
import { buildCandidates, formatProb, pick, rarityOf } from '../lottery';
import { uid } from '../presets';
import { sfx, unlockAudio, vibrate } from '../sound';
import { getState, update } from '../store';
import type { Candidate, EffectId, Item, Rarity, State } from '../types';
import { choice, h, toast } from '../ui';

export function currentCandidates(s: State, exclude?: Set<string>): Candidate[] {
  return buildCandidates(
    exclude ? s.items.filter((i) => !exclude.has(i.id)) : s.items,
    {
      mode: s.mode,
      outFilter: s.outFilter,
      tags: s.tagFilter,
      history: s.history,
      recentPenalty: s.settings.recentPenalty,
      recentDays: s.settings.recentDays,
    },
  );
}

export interface Stage {
  overlay: HTMLElement;
  body: HTMLElement;
  skip: HTMLButtonElement;
  close: () => void;
}

let busy = false;

/** 全画面の演出ステージを開く。同時に一つだけ */
export function openStage(bg: string): Stage | null {
  if (busy) return null;
  busy = true;
  unlockAudio();
  const body = h('div', { class: 'stage-body' });
  const skip = h('button', { class: 'skip' }, 'スキップ ⏭');
  const overlay = h('div', { class: `stage ${bg}` }, [skip, body]);
  document.body.append(overlay);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => overlay.classList.add('open'));
  const close = () => {
    overlay.classList.remove('open');
    document.body.classList.remove('no-scroll');
    setTimeout(() => overlay.remove(), 250);
    busy = false;
  };
  return { overlay, body, skip, close };
}

export interface DrawOptions {
  effect?: EffectId;
  /** 拒否権などで外した項目 */
  exclude?: Set<string>;
}

export async function runDraw(opts: DrawOptions = {}): Promise<void> {
  const s = getState();
  const cands = currentCandidates(s, opts.exclude);
  if (!cands.length) return toast('候補がありません。リストや絞り込みを見直してね');
  const effectId: EffectId = opts.effect ?? (s.settings.effect === 'random' ? choice(EFFECT_IDS) : s.settings.effect);
  const st = openStage(`fx-${effectId}-bg`);
  if (!st) return;
  sfx.tap();

  const winner = pick(cands);
  const rarity = rarityOf(winner, cands.length);
  const abort = new AbortController();
  st.skip.addEventListener('click', () => abort.abort());
  try {
    await EFFECTS[effectId].run({ stage: st.body, cands, winner, rarity, signal: abort.signal });
  } catch (e) {
    console.error(e);
  }
  showResult(st, winner, rarity, cands.length, () => void runDraw({ ...opts, effect: effectId }));
}

function searchUrl(item: Item): { label: string; url: string } {
  if (item.mode === 'home') {
    return { label: '🔎 レシピを探す', url: `https://www.google.com/search?q=${encodeURIComponent(`${item.name} レシピ`)}` };
  }
  const q = item.kind === 'shop' && item.memo ? item.memo : item.name;
  return { label: '🗺️ 地図で探す', url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` };
}

export function showResult(st: Stage, c: Candidate, rarity: Rarity, count: number, retry: () => void): void {
  const it = c.item;
  const link = searchUrl(it);
  const rarityBadge = rarity === 'super' ? '🌈 超レア！' : rarity === 'rare' ? '✨ レア！' : null;
  const share = async () => {
    const text = `今日のごはんは「${it.emoji} ${it.name}」に決定！`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast('コピーしました');
      }
    } catch {
      /* キャンセル */
    }
  };
  st.skip.remove();
  st.body.replaceChildren(
    h('div', { class: `result ${rarity}` }, [
      rarityBadge ? h('div', { class: 'rarity' }, rarityBadge) : null,
      h('div', { class: 'result-lead' }, '今日はこれに決定！'),
      h('div', { class: 'result-emoji' }, it.emoji),
      h('div', { class: 'result-name' }, it.name),
      h('div', { class: 'result-meta' }, [
        it.category ? `${it.category}・` : '',
        `確率 ${formatProb(c.prob)}（${count}件中）`,
        c.recent ? '・最近食べた' : '',
      ]),
      h('div', { class: 'result-actions' }, [
        h(
          'button',
          {
            class: 'primary',
            onClick: () => {
              update((s) => {
                s.history.unshift({ id: uid(), itemId: it.id, name: it.name, emoji: it.emoji, mode: it.mode, at: Date.now() });
                s.history = s.history.slice(0, 300);
              });
              toast(`${it.emoji} ${it.name} を履歴に記録しました`);
              st.close();
            },
          },
          'これにする！',
        ),
        h('a', { class: 'btn', href: link.url, target: '_blank', rel: 'noopener' }, link.label),
        h('button', { class: 'btn', onClick: () => void share() }, '📤 共有'),
        h('button', { class: 'btn ghost', onClick: () => { st.close(); setTimeout(retry, 280); } }, '🔁 もう一回'),
        h('button', { class: 'btn ghost', onClick: st.close }, '閉じる'),
      ]),
    ]),
  );
  sfx.fanfare(rarity);
  vibrate(rarity === 'normal' ? 40 : [60, 40, 60, 40, 120]);
  confetti(rarity, it.emoji);
}
