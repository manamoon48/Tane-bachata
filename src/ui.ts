type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

/** 小さな DOM ビルダー。文字列は textContent として入るので HTML 注入されない */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Child[] | Child = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of Array.isArray(children) ? children : [children]) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    });
  });
}

/** requestAnimationFrame ループ。step が false を返すと終了 */
export function animate(step: (now: number) => boolean | void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const loop = (now: number) => {
      if (signal?.aborted || step(now) === false) return resolve();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

let toastTimer = 0;
export function toast(msg: string): void {
  let el = document.querySelector<HTMLElement>('.toast');
  if (!el) {
    el = h('div', { class: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 2200);
}

/** 下からせり上がるシート。close() で閉じる */
export function openSheet(build: (close: () => void) => HTMLElement): void {
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const close = () => {
    backdrop.classList.remove('open');
    setTimeout(() => backdrop.remove(), 250);
  };
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, [h('div', { class: 'sheet-grip' }), build(close)]);
  backdrop.append(sheet);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.body.append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));
}

export function segmented<T extends string>(
  options: { value: T; label: string }[],
  current: T,
  onChange: (v: T) => void,
  cls = '',
): HTMLElement {
  return h(
    'div',
    { class: `seg ${cls}`, role: 'tablist' },
    options.map((o) =>
      h('button', { class: o.value === current ? 'on' : '', role: 'tab', 'aria-selected': String(o.value === current), onClick: () => onChange(o.value) }, o.label),
    ),
  );
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const choice = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** null/false を読み飛ばして中身を差し替える */
export function fill(root: HTMLElement, ...children: Child[]): void {
  root.replaceChildren(...children.filter((c): c is Node | string | number => c !== null && c !== undefined && c !== false).map((c) => (c instanceof Node ? c : String(c))));
}
