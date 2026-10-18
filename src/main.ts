import './style.css';
import { unlockAudio } from './sound';
import { subscribe } from './store';
import { h } from './ui';
import { renderDraw } from './views/draw';
import { renderHistory } from './views/history';
import { renderList } from './views/list';
import { renderSettings } from './views/settings';

type Tab = 'draw' | 'list' | 'history' | 'settings';

const TABS: { id: Tab; icon: string; label: string; render: (root: HTMLElement) => void }[] = [
  { id: 'draw', icon: '🎯', label: '決める', render: renderDraw },
  { id: 'list', icon: '📝', label: 'リスト', render: renderList },
  { id: 'history', icon: '🕘', label: '履歴', render: renderHistory },
  { id: 'settings', icon: '⚙️', label: '設定', render: renderSettings },
];

let tab: Tab = (TABS.find((t) => `#${t.id}` === location.hash)?.id) ?? 'draw';
const main = h('main', { class: 'view' });
const nav = h('nav', { class: 'tabbar' });

function render(): void {
  const t = TABS.find((x) => x.id === tab)!;
  // 再描画でスクロール位置が飛ばないように保持
  const y = window.scrollY;
  t.render(main);
  window.scrollTo(0, y);
  nav.replaceChildren(
    ...TABS.map((x) =>
      h('button', { class: x.id === tab ? 'on' : '', onClick: () => go(x.id) }, [h('span', { class: 'tab-icon' }, x.icon), h('span', {}, x.label)]),
    ),
  );
}

function go(next: Tab): void {
  if (next === tab) return;
  tab = next;
  history.replaceState(null, '', `#${next}`);
  render();
  window.scrollTo(0, 0);
}

document.querySelector('#app')!.append(main, nav);
subscribe(render);
render();

// iOS で最初のタップ時に音声を有効化
window.addEventListener('pointerdown', unlockAudio, { once: true });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js'));
}
