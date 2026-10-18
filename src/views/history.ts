import { getState, update } from '../store';
import type { HistoryEntry } from '../types';
import { fill, h } from '../ui';

const fmtDay = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
const fmtTime = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' });

export function renderHistory(root: HTMLElement): void {
  const { history } = getState();
  const days = new Map<string, HistoryEntry[]>();
  for (const e of history) {
    const k = fmtDay.format(e.at);
    days.set(k, [...(days.get(k) ?? []), e]);
  }
  const counts = new Map<string, { e: HistoryEntry; n: number }>();
  for (const e of history) {
    const c = counts.get(e.itemId);
    counts.set(e.itemId, { e: c?.e ?? e, n: (c?.n ?? 0) + 1 });
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 5);

  fill(root,
    h('header', { class: 'page-head' }, [h('h1', {}, '履歴'), h('p', {}, '「これにする！」を押したものが記録されます。最近食べたものは出にくくなります。')]),
    history.length === 0
      ? h('section', { class: 'card' }, h('p', { class: 'empty' }, 'まだ履歴はありません'))
      : null,
    top.length
      ? h('section', { class: 'card' }, [
          h('div', { class: 'card-title' }, 'よく食べてるもの'),
          h('ol', { class: 'ranking' }, top.map((t) => h('li', {}, [h('span', {}, `${t.e.emoji} ${t.e.name}`), h('b', {}, `${t.n}回`)]))),
        ])
      : null,
    ...[...days.entries()].map(([day, list]) =>
      h('section', { class: 'card' }, [
        h('div', { class: 'card-title' }, day),
        h(
          'ul',
          { class: 'hist' },
          list.map((e) =>
            h('li', {}, [
              h('span', { class: 'hist-emoji' }, e.emoji),
              h('span', { class: 'hist-name' }, e.name),
              h('span', { class: 'hist-mode' }, e.mode === 'home' ? '内食' : '外食'),
              h('span', { class: 'hist-time' }, fmtTime.format(e.at)),
              h('button', { class: 'x', 'aria-label': '削除', onClick: () => update((s) => { s.history = s.history.filter((x) => x.id !== e.id); }) }, '×'),
            ]),
          ),
        ),
      ]),
    ),
    history.length
      ? h('button', { class: 'btn danger wide', onClick: () => confirm('履歴をすべて消しますか？') && update((s) => { s.history = []; }) }, '履歴をすべて消す')
      : null,
  );
}
