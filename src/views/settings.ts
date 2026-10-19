import { defaultState, getState, parseState, replaceState, update } from '../store';
import { presetItems } from '../presets';
import { fill, h, openSheet, toast } from '../ui';

function toggle(label: string, desc: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  return h('label', { class: 'setting' }, [
    h('span', { class: 'setting-text' }, [h('b', {}, label), h('small', {}, desc)]),
    h('input', { type: 'checkbox', class: 'switch', checked, onChange: (e: Event) => onChange((e.target as HTMLInputElement).checked) }),
  ]);
}

export function renderSettings(root: HTMLElement): void {
  const s = getState();
  fill(root,
    h('header', { class: 'page-head' }, [h('h1', {}, '設定')]),
    h('section', { class: 'card' }, [
      toggle('効果音・バイブ', '演出の音とバイブレーション（対応端末のみ）', s.settings.sound, (v) => update((st) => { st.settings.sound = v; })),
      toggle('最近食べたものを出にくく', '履歴にあるものの確率を 1/4 にします', s.settings.recentPenalty, (v) => update((st) => { st.settings.recentPenalty = v; })),
      s.settings.recentPenalty
        ? h('label', { class: 'setting' }, [
            h('span', { class: 'setting-text' }, [h('b', {}, '「最近」の範囲')]),
            h(
              'select',
              { onChange: (e: Event) => update((st) => { st.settings.recentDays = Number((e.target as HTMLSelectElement).value); }) },
              [1, 2, 3, 5, 7, 14].map((d) => h('option', { value: String(d), selected: d === s.settings.recentDays }, `${d}日以内`)),
            ),
          ])
        : null,
      h('label', { class: 'setting' }, [
        h('span', { class: 'setting-text' }, [h('b', {}, 'やり直し回数'), h('small', {}, '結果画面の「もう一回」を押せる回数')]),
        h(
          'select',
          { onChange: (e: Event) => update((st) => { st.settings.retryLimit = Number((e.target as HTMLSelectElement).value); }) },
          [0, 1, 2, 3].map((n) => h('option', { value: String(n), selected: n === s.settings.retryLimit }, n ? `${n}回まで` : '無制限')),
        ),
      ]),
    ]),
    h('section', { class: 'card' }, [
      h('div', { class: 'card-title' }, 'データ'),
      h('p', { class: 'note' }, 'データはこの端末のブラウザ内だけに保存されます。機種変更の際はバックアップをどうぞ。'),
      h('p', { class: 'note' }, '「消したサンプルを戻す」は、最初から入っているサンプルのうち今のリストに無いものだけを追加します（自分で追加・編集したものはそのまま）。'),
      h('div', { class: 'btn-col' }, [
        h('button', { class: 'btn', onClick: exportData }, '📦 バックアップ（コピー）'),
        h('button', { class: 'btn', onClick: importData }, '📥 バックアップから復元'),
        h('button', {
          class: 'btn',
          onClick: () => {
            if (!confirm('サンプルのうち、今のリストに無いものを追加します。今のリストはそのまま残ります。よろしいですか？')) return;
            let added = 0;
            update((st) => {
              const names = new Set(st.items.map((i) => `${i.mode}:${i.kind}:${i.name}`));
              const missing = presetItems().filter((i) => !names.has(`${i.mode}:${i.kind}:${i.name}`));
              added = missing.length;
              st.items.push(...missing);
            });
            toast(added ? `サンプルを${added}件追加しました` : '追加できるサンプルはありません');
          },
        }, '🍱 消したサンプルを戻す'),
        h('button', {
          class: 'btn danger',
          onClick: () => {
            if (!confirm('リスト・履歴・設定をすべて初期状態に戻しますか？')) return;
            replaceState(defaultState());
            toast('初期化しました');
          },
        }, 'すべて初期化'),
      ]),
    ]),
    h('section', { class: 'card' }, [
      h('div', { class: 'card-title' }, 'ホーム画面に追加'),
      h('p', { class: 'note' }, 'iPhone: Safari の共有ボタン →「ホーム画面に追加」で、アプリのように全画面で使えます。オフラインでも動きます。'),
    ]),
    h('p', { class: 'version' }, '今日、何食べる？ v0.2'),
  );
}

async function exportData(): Promise<void> {
  const json = JSON.stringify(getState());
  try {
    await navigator.clipboard.writeText(json);
    toast('クリップボードにコピーしました。メモ等に保存してね');
  } catch {
    openSheet(() => h('div', { class: 'editor' }, [h('h2', {}, 'バックアップ'), h('p', { class: 'note' }, '下の文字列をすべてコピーして保存してください。'), h('textarea', { rows: '8', readonly: true }, json)]));
  }
}

function importData(): void {
  openSheet((close) => {
    const ta = h('textarea', { rows: '8', placeholder: 'バックアップの文字列を貼り付け' });
    return h('div', { class: 'editor' }, [
      h('h2', {}, '復元'),
      ta,
      h('div', { class: 'editor-actions' }, [
        h('button', { class: 'btn ghost', onClick: close }, 'キャンセル'),
        h('button', {
          class: 'primary',
          onClick: () => {
            const next = parseState(ta.value.trim());
            if (!next) return toast('読み込めませんでした');
            if (!confirm('今のデータを上書きして復元しますか？')) return;
            replaceState(next);
            close();
            toast('復元しました');
          },
        }, '復元する'),
      ]),
    ]);
  });
}
