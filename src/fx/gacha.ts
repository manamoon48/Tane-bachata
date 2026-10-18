import { sfx, vibrate } from '../sound';
import type { Rarity } from '../types';
import { choice, h, rand, sleep } from '../ui';
import { waitCrank } from './crank';
import type { FxContext } from './index';

const PLAIN = ['#4aa8ff', '#4ad6a6', '#ff8fc2', '#c56bff', '#ff9f43'];

function capsule(color: string, cls = ''): HTMLElement {
  return h('div', { class: `capsule ${cls}`, style: `--cap:${color}` }, [h('div', { class: 'cap-top' }), h('div', { class: 'cap-bottom' })]);
}

function colorFor(r: Rarity): string {
  return r === 'super' ? 'rainbow' : r === 'rare' ? 'gold' : choice(PLAIN);
}

export async function gacha(ctx: FxContext): Promise<void> {
  const { stage, signal, rarity, winner } = ctx;
  const globe = h('div', { class: 'gacha-globe' });
  for (let i = 0; i < 16; i++) {
    const c = capsule(i === 3 ? '#ffd84a' : choice(PLAIN), 'mini');
    c.style.left = `${rand(8, 68)}%`;
    c.style.top = `${rand(28, 68)}%`;
    c.style.transform = `rotate(${rand(0, 360)}deg)`;
    globe.append(c);
  }
  const dial = h('div', { class: 'gacha-dial', 'aria-label': 'ハンドル' }, h('div', { class: 'dial-bar' }));
  const outlet = h('div', { class: 'gacha-outlet' });
  const caption = h('div', { class: 'fx-caption' }, 'ハンドルを回してね（タップでもOK）');
  const machine = h('div', { class: 'gacha-machine' }, [
    globe,
    h('div', { class: 'gacha-body' }, [h('div', { class: 'gacha-plate' }, 'ごはんガチャ'), dial, outlet]),
  ]);
  const scene = h('div', { class: 'fx-gacha' }, [caption, machine]);
  stage.append(scene);

  await waitCrank(
    dial,
    {
      totalDeg: 360,
      stepDeg: 90,
      tapDeg: 120,
      onStep: () => {
        sfx.crank();
        vibrate(15);
        globe.classList.remove('shake');
        void globe.offsetWidth;
        globe.classList.add('shake');
      },
    },
    signal,
  );
  if (signal.aborted) return;
  caption.textContent = '';

  // 昇格演出: 最初は一段低い色で出てきて、光って変わる
  const finalColor = colorFor(rarity);
  const promote = (rarity === 'super' && Math.random() < 0.5) || (rarity === 'rare' && Math.random() < 0.4);
  const firstColor = promote ? (rarity === 'super' ? 'gold' : choice(PLAIN)) : finalColor;
  const cap = capsule(firstColor === 'gold' || firstColor === 'rainbow' ? '#fff' : firstColor, `big ${firstColor === 'gold' ? 'gold' : firstColor === 'rainbow' ? 'rainbow' : ''}`);
  // 暗転の影響を受けないよう、カプセルは取り出し口の位置に合わせてシーン直下に置く
  const ob = outlet.getBoundingClientRect();
  const sc = scene.getBoundingClientRect();
  const ox = ob.left - sc.left + ob.width / 2;
  const oy = ob.top - sc.top + ob.height / 2;
  cap.style.left = `${ox - 28}px`;
  cap.style.top = `${oy - 28}px`;
  scene.append(cap);
  await sleep(200, signal);
  sfx.drop();
  cap.classList.add('drop');
  await sleep(800, signal);

  // 画面中央へ
  const dx = sc.width / 2 - ox;
  const dy = sc.height * 0.42 - oy;
  cap.classList.remove('drop');
  cap.style.setProperty('--dx', `${dx}px`);
  cap.style.setProperty('--dy', `${dy}px`);
  cap.classList.add('center');
  machine.classList.add('dim');
  await sleep(700, signal);

  if (promote) {
    caption.textContent = '…！？';
    await sleep(500, signal);
    cap.classList.add('flash');
    sfx.sparkle();
    vibrate([40, 30, 40]);
    await sleep(350, signal);
    cap.classList.remove('gold', 'rainbow');
    if (finalColor === 'gold' || finalColor === 'rainbow') cap.classList.add(finalColor);
    else cap.style.setProperty('--cap', finalColor);
    await sleep(500, signal);
    cap.classList.remove('flash');
    caption.textContent = rarity === 'super' ? '虹色カプセル！！' : '金色カプセル！';
  } else if (rarity !== 'normal') {
    caption.textContent = rarity === 'super' ? '虹色カプセル！！' : '金色カプセル！';
    sfx.sparkle();
  }

  // タップで開封（放置しても数秒で開く）
  const hint = h('div', { class: 'fx-caption tap-hint' }, 'タップして開けよう！');
  scene.append(hint);
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 6000);
    const go = () => { clearTimeout(t); resolve(); };
    cap.addEventListener('click', go, { once: true });
    scene.addEventListener('click', go, { once: true });
    signal.addEventListener('abort', go);
  });
  if (signal.aborted) return;
  hint.remove();
  cap.classList.add('wobble');
  sfx.crank();
  await sleep(700, signal);
  cap.classList.add('open');
  sfx.pop();
  vibrate([30, 30, 60]);
  const prize = h('div', { class: `gacha-prize ${rarity}` }, [h('div', { class: 'rays' }), h('div', { class: 'prize-emoji' }, winner.item.emoji), h('div', { class: 'prize-name' }, winner.item.name)]);
  scene.append(prize);
  caption.textContent = '';
  await sleep(1300, signal);
}
