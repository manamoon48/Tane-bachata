import { sfx, vibrate } from '../sound';
import type { Rarity } from '../types';
import { choice, h, sleep } from '../ui';
import { waitCrank } from './crank';
import type { FxContext } from './index';

function ballFor(r: Rarity): { cls: string; tier: string } {
  if (r === 'super') return { cls: 'rainbow', tier: '特賞' };
  if (r === 'rare') return { cls: 'gold', tier: '1等' };
  return choice([
    { cls: 'red', tier: '2等' },
    { cls: 'blue', tier: '3等' },
    { cls: 'green', tier: '4等' },
    { cls: 'white', tier: '5等' },
  ]);
}

/** 新井式回転抽選器（ガラガラ） */
export async function fukubiki(ctx: FxContext): Promise<void> {
  const { stage, signal, rarity, winner } = ctx;
  const drum = h('div', { class: 'fuku-drum', 'aria-label': 'ハンドル' }, [
    h('div', { class: 'fuku-oct' }, [h('div', { class: 'fuku-hub' })]),
    h('div', { class: 'fuku-arm' }, h('div', { class: 'fuku-knob' })),
  ]);
  const ball = h('div', { class: 'fuku-ball' });
  const machine = h('div', { class: 'fuku-machine' }, [
    h('div', { class: 'fuku-stand' }),
    h('div', { class: 'fuku-chute' }),
    ball,
    drum,
    h('div', { class: 'fuku-tray' }),
  ]);
  const caption = h('div', { class: 'fx-caption' }, 'ガラガラを回してね（タップでもOK）');
  const scene = h('div', { class: 'fx-fuku' }, [h('div', { class: 'fuku-banner' }, '🎊 ごはん大抽選会 🎊'), machine, caption]);
  stage.append(scene);

  await waitCrank(
    drum,
    {
      totalDeg: 540,
      stepDeg: 60,
      tapDeg: 180,
      onStep: () => {
        sfx.rattle();
        vibrate(10);
      },
    },
    signal,
  );
  if (signal.aborted) return;
  caption.textContent = '';

  // 玉がコロンと出て、シュートを転がり受け皿へ
  const { cls, tier } = ballFor(rarity);
  ball.classList.add(cls, 'show');
  sfx.drop();
  await ball.animate(
    [
      { transform: 'translate(0, 0)', offset: 0 },
      { transform: 'translate(46px, 18px)', offset: 0.45 },
      { transform: 'translate(92px, 40px)', offset: 0.75 },
      { transform: 'translate(104px, 30px)', offset: 0.85 },
      { transform: 'translate(112px, 42px)', offset: 1 },
    ],
    { duration: 1100, easing: 'ease-in', fill: 'forwards' },
  ).finished.catch(() => undefined);
  sfx.stop();
  vibrate(30);
  await sleep(300, signal);

  // 係員の「大当たり〜！」
  const call = h('div', { class: `fuku-call ${rarity}` }, rarity === 'normal' ? 'おめでとう〜！' : '大当たり〜！！');
  scene.append(call);
  sfx.bell(rarity === 'super' ? 12 : rarity === 'rare' ? 8 : 4);
  vibrate(rarity === 'normal' ? 40 : [50, 50, 50, 50, 50]);
  const b = ball.getBoundingClientRect();
  const sb = scene.getBoundingClientRect();
  const dx = sb.left + sb.width / 2 - (b.left + b.width / 2);
  const dy = sb.top + sb.height * 0.32 - (b.top + b.height / 2);
  machine.classList.add('dim');
  await ball.animate(
    [{ transform: 'translate(112px, 42px)' }, { transform: `translate(${112 + dx}px, ${42 + dy}px) scale(3)` }],
    { duration: 700, easing: 'cubic-bezier(.3,1.3,.5,1)', fill: 'forwards' },
  ).finished.catch(() => undefined);

  const noshi = h('div', { class: `fuku-noshi ${rarity}` }, [
    h('div', { class: 'noshi-tier' }, tier),
    h('div', { class: 'noshi-name' }, `${winner.item.emoji} ${winner.item.name}`),
  ]);
  scene.append(noshi);
  await sleep(1600, signal);
}
