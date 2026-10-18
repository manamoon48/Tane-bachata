import { pick, rarityOf, sampleWeighted } from '../lottery';
import { sfx, vibrate } from '../sound';
import { getState } from '../store';
import type { Candidate } from '../types';
import { h, sleep, toast } from '../ui';
import { currentCandidates, openStage, runDraw, showResult, type Stage } from './stage';

function waitClick(btn: HTMLElement): Promise<void> {
  return new Promise((resolve) => btn.addEventListener('click', () => resolve(), { once: true }));
}

/** 拒否権モード：人数ぶん順番に「これは嫌」を選んでから抽選 */
export async function runVeto(): Promise<void> {
  const s = getState();
  const cands = currentCandidates(s);
  if (cands.length < 2) return toast('候補が2件以上必要です');
  const st = openStage('veto-bg');
  if (!st) return;
  let cancelled = false;
  st.skip.textContent = 'やめる ✕';
  st.skip.addEventListener('click', () => { cancelled = true; st.close(); });

  const { vetoPlayers: players, vetoEach: each } = s.settings;
  const vetoed = new Map<string, number>(); // itemId → 誰が拒否したか
  for (let p = 1; p <= players && !cancelled; p++) {
    // 端末の受け渡し画面
    const ok = h('button', { class: 'primary big' }, 'OK、選ぶ');
    st.body.replaceChildren(
      h('div', { class: 'handoff' }, [
        h('div', { class: 'handoff-icon' }, ['🙂', '😎', '🤔', '😋'][p - 1] ?? '🙂'),
        h('div', { class: 'handoff-title' }, `${p}人目の番です`),
        h('div', { class: 'handoff-sub' }, p === 1 ? `「これは嫌」を${each}つ選んでね` : 'スマホを渡してね'),
        ok,
      ]),
    );
    await waitClick(ok);
    if (cancelled) return;
    sfx.tap();
    await pickVetoes(st, cands, vetoed, p, each);
  }
  if (cancelled) return;

  const names = cands.filter((c) => vetoed.has(c.item.id)).map((c) => `${c.item.emoji}${c.item.name}`);
  st.body.replaceChildren(
    h('div', { class: 'handoff' }, [
      h('div', { class: 'handoff-icon' }, '🙅'),
      h('div', { class: 'handoff-title' }, names.length ? '拒否されたもの' : '拒否なし！'),
      h('div', { class: 'veto-list' }, names.join('　')),
      h('div', { class: 'handoff-sub' }, `残り ${cands.length - names.length} 件で抽選します`),
    ]),
  );
  sfx.stop();
  await sleep(1800);
  if (cancelled) return;
  st.close();
  await sleep(280);
  void runDraw({ exclude: new Set(vetoed.keys()) });
}

function pickVetoes(st: Stage, cands: Candidate[], vetoed: Map<string, number>, player: number, each: number): Promise<void> {
  return new Promise((resolve) => {
    const chosen = new Set<string>();
    const remainingAfter = () => cands.length - vetoed.size - chosen.size;
    const done = h('button', { class: 'primary big' });
    const grid = h('div', { class: 'veto-grid' });
    const render = () => {
      grid.replaceChildren(
        ...cands.map((c) => {
          const by = vetoed.get(c.item.id);
          const on = chosen.has(c.item.id);
          return h(
            'button',
            {
              class: `veto-card ${on ? 'on' : ''} ${by ? 'gone' : ''}`,
              disabled: !!by,
              onClick: () => {
                if (on) chosen.delete(c.item.id);
                else if (chosen.size < each && remainingAfter() > 1) chosen.add(c.item.id);
                else return toast(chosen.size >= each ? `${each}つまでです` : '全部は消せません');
                sfx.tap();
                render();
              },
            },
            [h('span', { class: 'veto-emoji' }, c.item.emoji), h('span', { class: 'veto-name' }, c.item.name), by ? h('span', { class: 'veto-by' }, `${by}人目が✕`) : null],
          );
        }),
      );
      done.textContent = chosen.size ? `${chosen.size}つ拒否して次へ` : 'パス（拒否しない）';
    };
    render();
    done.addEventListener('click', () => {
      chosen.forEach((id) => vetoed.set(id, player));
      if (chosen.size) {
        sfx.pop();
        vibrate(30);
      }
      resolve();
    });
    st.body.replaceChildren(
      h('div', { class: 'veto' }, [h('div', { class: 'veto-title' }, `${player}人目：嫌なものを最大${each}つ`), grid, done]),
    );
  });
}

const ELIM_MAX = 8;

/** 消去法モード：候補を1つずつ✕して、最後に残ったものに決定 */
export async function runElim(): Promise<void> {
  const s = getState();
  const all = currentCandidates(s);
  if (all.length < 2) return toast('候補が2件以上必要です');
  const st = openStage('veto-bg');
  if (!st) return;
  st.skip.textContent = 'やめる ✕';
  st.skip.addEventListener('click', st.close);

  // 候補が多いときは確率に応じて8件に絞る
  const picks = sampleWeighted(all, ELIM_MAX).sort(() => Math.random() - 0.5);
  const alive = new Set(picks);
  const cards = new Map<Candidate, HTMLElement>();
  const counter = h('div', { class: 'veto-title' });
  const updateCounter = () => { counter.textContent = `嫌なものを消していこう（残り${alive.size}）`; };
  updateCounter();

  const finish = new Promise<Candidate>((resolve) => {
    const remove = (c: Candidate) => {
      if (!alive.has(c) || alive.size <= 1) return;
      alive.delete(c);
      const el = cards.get(c)!;
      el.classList.add('gone');
      el.setAttribute('disabled', '');
      sfx.pop();
      vibrate(20);
      updateCounter();
      if (alive.size === 1) resolve([...alive][0]);
    };
    const grid = h(
      'div',
      { class: 'veto-grid elim' },
      picks.map((c) => {
        const el = h('button', { class: 'veto-card', onClick: () => remove(c) }, [
          h('span', { class: 'veto-emoji' }, c.item.emoji),
          h('span', { class: 'veto-name' }, c.item.name),
          h('span', { class: 'elim-x' }, '✕'),
        ]);
        cards.set(c, el);
        return el;
      }),
    );
    // 迷ったら運まかせ: 出やすさの低いものほど消えやすい
    const randomBtn = h('button', { class: 'btn big-ghost' }, '🎲 ランダムで1つ消す');
    randomBtn.addEventListener('click', () => {
      const list = [...alive].map((c) => ({ ...c, weight: 1 / c.weight }));
      const victim = pick(list);
      remove([...alive].find((c) => c.item.id === victim.item.id)!);
    });
    st.body.replaceChildren(h('div', { class: 'veto' }, [counter, grid, randomBtn]));
  });

  const winner = await finish;
  const el = cards.get(winner)!;
  el.classList.add('last');
  counter.textContent = '最後に残ったのは…';
  sfx.reach();
  await sleep(1300);
  if (!st.overlay.isConnected) return;
  showResult(st, winner, rarityOf(winner, all.length), all.length, () => void runElim());
}
