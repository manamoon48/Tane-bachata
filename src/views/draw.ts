import { confetti } from '../fx/confetti';
import { EFFECT_IDS, EFFECTS } from '../fx/index';
import { buildCandidates, formatProb, pick, rarityOf } from '../lottery';
import { uid } from '../presets';
import { sfx, unlockAudio, vibrate } from '../sound';
import { getState, update } from '../store';
import type { Candidate, EffectChoice, EffectId, Item, Rarity, State } from '../types';
import { choice, fill, h, segmented, toast } from '../ui';

export function currentCandidates(s: State): Candidate[] {
  return buildCandidates(s.items, {
    mode: s.mode,
    outFilter: s.outFilter,
    tags: s.tagFilter,
    history: s.history,
    recentPenalty: s.settings.recentPenalty,
    recentDays: s.settings.recentDays,
  });
}

function modeTags(s: State): string[] {
  const set = new Set<string>();
  for (const it of s.items) {
    if (it.mode !== s.mode) continue;
    if (s.mode === 'out' && s.outFilter !== 'all' && it.kind !== s.outFilter) continue;
    it.tags.forEach((t) => set.add(t));
  }
  return [...set];
}

export function renderDraw(root: HTMLElement): void {
  const s = getState();
  const cands = currentCandidates(s);
  const tags = modeTags(s);

  const effects: { id: EffectChoice; icon: string; label: string }[] = [
    ...EFFECT_IDS.map((id) => ({ id, icon: EFFECTS[id].icon, label: EFFECTS[id].label })),
    { id: 'random', icon: '🎲', label: 'おまかせ' },
  ];

  fill(root,
    h('header', { class: 'hero' }, [
      h('div', { class: 'hero-q' }, '今日、何食べたい？'),
      h('div', { class: 'hero-a' }, '「なんでもいい」なら、運命に決めてもらおう。'),
    ]),
    segmented(
      [
        { value: 'home', label: '🏠 内食' },
        { value: 'out', label: '🚶 外食' },
      ],
      s.mode,
      (v) => update((st) => { st.mode = v; st.tagFilter = []; }),
      'big',
    ),
    s.mode === 'out'
      ? segmented(
          [
            { value: 'all', label: 'ぜんぶ' },
            { value: 'genre', label: 'ジャンル' },
            { value: 'shop', label: 'お店' },
          ],
          s.outFilter,
          (v) => update((st) => { st.outFilter = v; st.tagFilter = []; }),
          'small',
        )
      : null,
    tags.length
      ? h('section', { class: 'card' }, [
          h('div', { class: 'card-title' }, '気分で絞り込み'),
          h(
            'div',
            { class: 'chips' },
            tags.map((t) =>
              h(
                'button',
                {
                  class: `chip ${s.tagFilter.includes(t) ? 'on' : ''}`,
                  onClick: () =>
                    update((st) => {
                      st.tagFilter = st.tagFilter.includes(t) ? st.tagFilter.filter((x) => x !== t) : [...st.tagFilter, t];
                    }),
                },
                t,
              ),
            ),
          ),
        ])
      : null,
    h('section', { class: 'card' }, [
      h('div', { class: 'card-title' }, '演出'),
      h(
        'div',
        { class: 'fx-picker' },
        effects.map((e) =>
          h('button', { class: `fx-opt ${s.settings.effect === e.id ? 'on' : ''}`, onClick: () => update((st) => { st.settings.effect = e.id; }) }, [
            h('span', { class: 'fx-icon' }, e.icon),
            h('span', {}, e.label),
          ]),
        ),
      ),
    ]),
    h('button', { class: 'go', disabled: cands.length === 0, onClick: () => void runDraw() }, cands.length ? '決める！' : '候補がありません'),
    h('details', { class: 'card odds' }, [
      h('summary', {}, `候補 ${cands.length} 件の確率を見る`),
      h(
        'ol',
        {},
        [...cands]
          .sort((a, b) => b.prob - a.prob)
          .map((c) =>
            h('li', {}, [
              h('span', { class: 'odds-name' }, `${c.item.emoji} ${c.item.name}`),
              c.recent ? h('span', { class: 'badge' }, '最近食べた') : null,
              h('span', { class: 'odds-bar' }, h('i', { style: `width:${Math.max(2, c.prob * 100 / cands.reduce((m, x) => Math.max(m, x.prob), 0))}%` })),
              h('span', { class: 'odds-pct' }, formatProb(c.prob)),
            ]),
          ),
      ),
    ]),
  );
}

let running = false;

export async function runDraw(forceEffect?: EffectId): Promise<void> {
  if (running) return;
  const s = getState();
  const cands = currentCandidates(s);
  if (!cands.length) return toast('候補がありません。リストや絞り込みを見直してね');
  running = true;
  unlockAudio();
  sfx.tap();

  const winner = pick(cands);
  const rarity = rarityOf(winner, cands.length);
  const effectId: EffectId = forceEffect ?? (s.settings.effect === 'random' ? choice(EFFECT_IDS) : s.settings.effect);

  const abort = new AbortController();
  const stage = h('div', { class: 'stage-body' });
  const skip = h('button', { class: 'skip', onClick: () => abort.abort() }, 'スキップ ⏭');
  const overlay = h('div', { class: `stage fx-${effectId}-bg` }, [skip, stage]);
  document.body.append(overlay);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => overlay.classList.add('open'));

  try {
    await EFFECTS[effectId].run({ stage, cands, winner, rarity, signal: abort.signal });
  } catch (e) {
    console.error(e);
  }
  skip.remove();
  showResult(overlay, stage, winner, rarity, effectId, cands.length);
}

function close(overlay: HTMLElement): void {
  overlay.classList.remove('open');
  document.body.classList.remove('no-scroll');
  setTimeout(() => overlay.remove(), 250);
  running = false;
}

function searchUrl(item: Item): { label: string; url: string } {
  if (item.mode === 'home') {
    return { label: '🔎 レシピを探す', url: `https://www.google.com/search?q=${encodeURIComponent(`${item.name} レシピ`)}` };
  }
  const q = item.kind === 'shop' && item.memo ? item.memo : item.name;
  return { label: '🗺️ 地図で探す', url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` };
}

function showResult(overlay: HTMLElement, stage: HTMLElement, c: Candidate, rarity: Rarity, effectId: EffectId, count: number): void {
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
  // 決定しても画面は閉じず、調べる・共有はそのまま使えるようにする
  const retry = h('button', { class: 'btn ghost', onClick: () => { close(overlay); setTimeout(() => void runDraw(effectId), 280); } }, '🔁 もう一回');
  const decide = h('button', { class: 'primary' }, 'これにする！');
  const card = h('div', { class: `result ${rarity}` }, [
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
      decide,
      h('a', { class: 'btn', href: link.url, target: '_blank', rel: 'noopener' }, link.label),
      h('button', { class: 'btn', onClick: () => void share() }, '📤 共有'),
      retry,
      h('button', { class: 'btn ghost', onClick: () => close(overlay) }, '閉じる'),
    ]),
  ]);
  decide.addEventListener('click', () => {
    update((st) => {
      st.history.unshift({ id: uid(), itemId: it.id, name: it.name, emoji: it.emoji, mode: it.mode, at: Date.now() });
      st.history = st.history.slice(0, 300);
    });
    decide.disabled = true;
    decide.textContent = '✓ 履歴に記録しました';
    retry.disabled = true;
    card.append(h('div', { class: 'stamp' }, '決定'));
    sfx.stop();
    vibrate(50);
  }, { once: true });
  stage.replaceChildren(card);
  sfx.fanfare(rarity);
  vibrate(rarity === 'normal' ? 40 : [60, 40, 60, 40, 120]);
  confetti(rarity, it.emoji);
}
