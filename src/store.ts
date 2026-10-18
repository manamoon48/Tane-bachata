import { presetItems } from './presets';
import type { State } from './types';

const KEY = 'nandemoii:v1';

export function defaultState(): State {
  return {
    version: 1,
    mode: 'home',
    outFilter: 'all',
    tagFilter: [],
    items: presetItems(),
    history: [],
    settings: { sound: true, recentPenalty: true, recentDays: 3, effect: 'roulette', drawStyle: 'normal', vetoPlayers: 2, vetoEach: 1, retryLimit: 0 },
  };
}

/** 保存データを既定値とマージして読み込む。壊れていれば null */
export function parseState(raw: string): State | null {
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Array.isArray(data.items)) return null;
    const base = defaultState();
    return {
      ...base,
      ...data,
      tagFilter: Array.isArray(data.tagFilter) ? data.tagFilter : [],
      history: Array.isArray(data.history) ? data.history : [],
      settings: { ...base.settings, ...(data.settings ?? {}) },
    };
  } catch {
    return null;
  }
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return parseState(raw) ?? defaultState();
  } catch {
    /* ストレージ不可（プライベートモード等）でも動かす */
  }
  return defaultState();
}

let state: State = load();
const listeners = new Set<() => void>();

export function getState(): State {
  return state;
}

export function update(fn: (s: State) => void): void {
  fn(state);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 保存できなくてもメモリ上では動かす */
  }
  listeners.forEach((l) => l());
}

export function replaceState(next: State): void {
  update((s) => Object.assign(s, next));
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
