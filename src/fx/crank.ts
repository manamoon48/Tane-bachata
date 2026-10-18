/**
 * ハンドルを回す操作。ドラッグで回した角度を積算し、ほぼ動かさなければタップ扱いで tapDeg 回す。
 * stepDeg ごとに onStep を呼び、合計 totalDeg に達したら resolve する。
 */
export function waitCrank(
  handle: HTMLElement,
  opts: { totalDeg: number; stepDeg: number; tapDeg: number; onStep: () => void; onRotate?: (deg: number) => void },
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    let total = 0;
    let lastStep = 0;
    let prevAngle: number | null = null;
    let moved = 0;
    let done = false;
    const setRot = () => {
      (opts.onRotate ?? ((d) => { handle.style.transform = `rotate(${d}deg)`; }))(total);
      const step = Math.floor(total / opts.stepDeg);
      if (step > lastStep) {
        lastStep = step;
        opts.onStep();
      }
      if (total >= opts.totalDeg && !done) {
        done = true;
        resolve();
      }
    };
    const angle = (e: PointerEvent) => {
      const b = handle.getBoundingClientRect();
      return (Math.atan2(e.clientY - (b.top + b.height / 2), e.clientX - (b.left + b.width / 2)) * 180) / Math.PI;
    };
    handle.addEventListener('pointerdown', (e) => {
      handle.setPointerCapture(e.pointerId);
      prevAngle = angle(e);
      moved = 0;
    });
    handle.addEventListener('pointermove', (e) => {
      if (prevAngle === null || done) return;
      const a = angle(e);
      let d = a - prevAngle;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      prevAngle = a;
      moved += Math.abs(d);
      total += Math.abs(d);
      setRot();
    });
    handle.addEventListener('pointerup', () => {
      prevAngle = null;
      if (moved < 10 && !done) {
        handle.classList.add('smooth');
        total = (Math.floor(total / opts.tapDeg) + 1) * opts.tapDeg;
        setRot();
        setTimeout(() => handle.classList.remove('smooth'), 250);
      }
    });
    signal.addEventListener('abort', () => resolve());
  });
}
