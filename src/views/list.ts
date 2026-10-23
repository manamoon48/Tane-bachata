import { buildCandidates, formatProb, LEVELS, levelLabel, weightLabel } from '../lottery';
import { EMOJI_GROUPS, uid } from '../presets';
import { getState, update } from '../store';
import type { Item, Level, Mode, OutKind } from '../types';
import { fill, h, openSheet, segmented, toast } from '../ui';

function stepLevel(id: string, delta: number): void {
  update((s) => {
    const it = s.items.find((x) => x.id === id);
    if (!it) return;
    const i = LEVELS.indexOf(it.level);
    it.level = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i + delta))];
  });
}

function row(it: Item, prob: number | undefined): HTMLElement {
  return h('li', { class: `item lv${it.level}` }, [
    h('button', { class: 'item-main', onClick: () => openEditor(it) }, [
      h('span', { class: 'item-emoji' }, it.emoji),
      h('span', { class: 'item-text' }, [
        h('span', { class: 'item-name' }, it.name),
        h('span', { class: 'item-sub' }, [it.category, ...it.tags.map((t) => `#${t}`)].filter(Boolean).join(' ')),
      ]),
    ]),
    h('div', { class: 'stepper' }, [
      h('button', { 'aria-label': '出にくくする', disabled: it.level <= -3, onClick: () => stepLevel(it.id, -1) }, '−'),
      h('span', { class: 'lv' }, [h('b', {}, levelLabel(it.level)), h('small', {}, prob ? formatProb(prob) : weightLabel(it.level))]),
      h('button', { 'aria-label': '出やすくする', disabled: it.level >= 3, onClick: () => stepLevel(it.id, 1) }, '+'),
    ]),
  ]);
}

export function renderList(root: HTMLElement): void {
  const s = getState();
  const items = s.items.filter((it) => it.mode === s.mode);
  // 絞り込みや「最近食べた」を除いた、素の確率を表示
  const probs = new Map(buildCandidates(s.items, { mode: s.mode }).map((c) => [c.item.id, c.prob]));
  const groups: { title: string | null; kind: OutKind | null; list: Item[] }[] =
    s.mode === 'home'
      ? [{ title: null, kind: null, list: items }]
      : [
          { title: 'ジャンル', kind: 'genre', list: items.filter((i) => i.kind === 'genre') },
          { title: 'お店', kind: 'shop', list: items.filter((i) => i.kind === 'shop') },
        ];

  fill(root,
    h('header', { class: 'page-head' }, [h('h1', {}, 'リスト'), h('p', {}, '−/＋ で出やすさを7段階で調整。名前をタップで編集。')]),
    segmented(
      [
        { value: 'home', label: '🏠 内食' },
        { value: 'out', label: '🚶 外食' },
      ],
      s.mode,
      (v: Mode) => update((st) => { st.mode = v; st.tagFilter = []; }),
      'big',
    ),
    ...groups.map((g) =>
      h('section', { class: 'card list' }, [
        g.title ? h('div', { class: 'card-title' }, `${g.title}（${g.list.length}）`) : null,
        g.list.length ? h('ul', { class: 'items' }, g.list.map((it) => row(it, probs.get(it.id)))) : h('p', { class: 'empty' }, 'まだありません'),
        h('button', { class: 'add', onClick: () => openEditor(newItem(s.mode, g.kind)) }, `＋ ${g.kind === 'shop' ? 'お店' : g.kind === 'genre' ? 'ジャンル' : 'メニュー'}を追加`),
      ]),
    ),
  );
}

function newItem(mode: Mode, kind: OutKind | null): Item {
  return { id: '', mode, kind: mode === 'out' ? kind ?? 'genre' : null, name: '', emoji: '🍽️', category: '', level: 0, tags: [], memo: '' };
}

function openEditor(src: Item): void {
  const draft: Item = { ...src, tags: [...src.tags] };
  const isNew = !src.id;
  const s = getState();
  const sameMode = s.items.filter((i) => i.mode === draft.mode);
  const allTags = [...new Set(sameMode.flatMap((i) => i.tags))];
  const allCats = [...new Set(sameMode.map((i) => i.category).filter(Boolean))];

  openSheet((close) => {
    const emojiInput = h('input', { class: 'emoji-input', value: draft.emoji, maxlength: '4', 'aria-label': '絵文字' });
    const nameInput = h('input', { value: draft.name, placeholder: draft.kind === 'shop' ? '例: いつものラーメン屋' : '例: カレー', 'aria-label': '名前' });
    const catInput = h('input', { value: draft.category, list: 'cat-list', placeholder: '例: 和食' });
    const tagInput = h('input', { value: draft.tags.join(' '), placeholder: 'スペース区切り 例: がっつり 時短' });
    const memoInput = h('input', { value: draft.memo, placeholder: '店名＋駅名や住所など' });
    // 絵文字はカテゴリのタブで切り替えて選ぶ（今の絵文字があるタブから開く）
    let tab = Math.max(0, EMOJI_GROUPS.findIndex((g) => g.list.includes(draft.emoji)));
    const emojiTabs = h('div', { class: 'emoji-tabs' });
    const emojiGrid = h('div', { class: 'emoji-grid' });
    const drawEmoji = () => {
      emojiTabs.replaceChildren(
        ...EMOJI_GROUPS.map((g, i) => h('button', { type: 'button', class: i === tab ? 'on' : '', onClick: () => { tab = i; drawEmoji(); } }, g.label)),
      );
      emojiGrid.replaceChildren(
        ...EMOJI_GROUPS[tab].list.map((e) =>
          h('button', { type: 'button', class: e === emojiInput.value ? 'on' : '', 'aria-label': e, onClick: () => { emojiInput.value = e; drawEmoji(); } }, e),
        ),
      );
    };
    const emojiPicker = h('div', { class: 'emoji-picker' }, [emojiTabs, emojiGrid]);
    emojiInput.addEventListener('input', drawEmoji);
    drawEmoji();
    let level: Level = draft.level;
    let kind = draft.kind;

    const levelBox = h('div', { class: 'level-pick' });
    const drawLevels = () =>
      levelBox.replaceChildren(
        ...LEVELS.map((l) =>
          h('button', { class: `lv${l} ${l === level ? 'on' : ''}`, onClick: () => { level = l; drawLevels(); } }, [h('b', {}, levelLabel(l)), h('small', {}, weightLabel(l))]),
        ),
      );
    drawLevels();

    const tagChips = h(
      'div',
      { class: 'chips' },
      allTags.map((t) =>
        h(
          'button',
          {
            class: 'chip small',
            type: 'button',
            onClick: () => {
              const cur = tagInput.value.split(/[\s,、]+/).filter(Boolean);
              tagInput.value = (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]).join(' ');
            },
          },
          `#${t}`,
        ),
      ),
    );

    const kindBox = h('div');
    const drawKind = () =>
      kindBox.replaceChildren(
        segmented(
          [
            { value: 'genre', label: 'ジャンル' },
            { value: 'shop', label: 'お店' },
          ],
          kind ?? 'genre',
          (v: OutKind) => { kind = v; drawKind(); memoField.hidden = v !== 'shop'; },
          'small',
        ),
      );
    const memoField = h('label', { class: 'field', hidden: kind !== 'shop' }, [h('span', {}, '地図検索ワード（任意）'), memoInput]);
    if (draft.mode === 'out') drawKind();

    const save = () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return toast('名前を入れてね');
      }
      const next: Item = {
        ...draft,
        id: draft.id || uid(),
        name,
        emoji: emojiInput.value.trim() || '🍽️',
        category: catInput.value.trim(),
        tags: [...new Set(tagInput.value.split(/[\s,、]+/).map((t) => t.replace(/^#/, '')).filter(Boolean))],
        memo: memoInput.value.trim(),
        level,
        kind: draft.mode === 'out' ? kind ?? 'genre' : null,
      };
      update((st) => {
        const i = st.items.findIndex((x) => x.id === next.id);
        if (i >= 0) st.items[i] = next;
        else st.items.push(next);
      });
      close();
    };

    const remove = () => {
      if (!confirm(`「${draft.name}」を削除しますか？`)) return;
      update((st) => { st.items = st.items.filter((x) => x.id !== draft.id); });
      close();
    };

    return h('form', { class: 'editor', onSubmit: (e: Event) => { e.preventDefault(); save(); } }, [
      h('h2', {}, isNew ? '追加' : '編集'),
      h('div', { class: 'name-row' }, [emojiInput, nameInput]),
      emojiPicker,
      draft.mode === 'out' ? h('div', { class: 'field' }, [h('span', {}, '種類'), kindBox]) : null,
      draft.mode === 'out' ? memoField : null,
      h('label', { class: 'field' }, [h('span', {}, 'カテゴリ（スロットのジャンル）'), catInput]),
      h('datalist', { id: 'cat-list' }, allCats.map((c) => h('option', { value: c }))),
      h('label', { class: 'field' }, [h('span', {}, 'タグ'), tagInput]),
      allTags.length ? tagChips : null,
      h('div', { class: 'field' }, [h('span', {}, '出やすさ'), levelBox]),
      h('div', { class: 'editor-actions' }, [
        !isNew ? h('button', { type: 'button', class: 'btn danger', onClick: remove }, '削除') : null,
        h('button', { type: 'button', class: 'btn ghost', onClick: close }, 'キャンセル'),
        h('button', { type: 'submit', class: 'primary' }, '保存'),
      ]),
    ]);
  });
}
