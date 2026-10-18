import { EFFECT_IDS, EFFECTS } from '../fx/index';
import { formatProb } from '../lottery';
import { getState, update } from '../store';
import type { DrawStyle, EffectChoice, State } from '../types';
import { fill, h, segmented } from '../ui';
import { runElim, runVeto } from './modes';
import { currentCandidates, runDraw } from './stage';

const STYLE_NOTE: Record<DrawStyle, string> = {
  normal: '確率どおりに抽選します。',
  veto: '順番に「これは嫌」を選んでから、残りで抽選します。',
  elim: '最大8件の候補から、嫌なものを消していき最後の1つに決定。',
};
const GO_LABEL: Record<DrawStyle, string> = { normal: '決める！', veto: '拒否して決める', elim: '消去法で決める' };

function stepper(label: string, value: number, min: number, max: number, unit: string, onChange: (v: number) => void): HTMLElement {
  return h('div', { class: 'mini-stepper' }, [
    h('span', {}, label),
    h('button', { disabled: value <= min, onClick: () => onChange(value - 1), 'aria-label': `${label}を減らす` }, '−'),
    h('b', {}, `${value}${unit}`),
    h('button', { disabled: value >= max, onClick: () => onChange(value + 1), 'aria-label': `${label}を増やす` }, '+'),
  ]);
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
  const style = s.settings.drawStyle;
  const need = style === 'normal' ? 1 : 2;
  const start = () => void (style === 'veto' ? runVeto() : style === 'elim' ? runElim() : runDraw());

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
      h('div', { class: 'card-title' }, '決め方'),
      segmented<DrawStyle>(
        [
          { value: 'normal', label: '🍀 抽選' },
          { value: 'veto', label: '🙅 拒否権' },
          { value: 'elim', label: '✂️ 消去法' },
        ],
        style,
        (v) => update((st) => { st.settings.drawStyle = v; }),
        'small',
      ),
      h('p', { class: 'note' }, STYLE_NOTE[style]),
      style === 'veto'
        ? h('div', { class: 'veto-opts' }, [
            stepper('人数', s.settings.vetoPlayers, 2, 4, '人', (v) => update((st) => { st.settings.vetoPlayers = v; })),
            stepper('1人あたり', s.settings.vetoEach, 1, 3, 'つ', (v) => update((st) => { st.settings.vetoEach = v; })),
          ])
        : null,
    ]),
    style === 'elim' ? null : h('section', { class: 'card' }, [
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
    h('button', { class: 'go', disabled: cands.length < need, onClick: start }, cands.length < need ? '候補が足りません' : GO_LABEL[style]),
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
