import { getState } from './store';
import type { Rarity } from './types';

// 効果音はすべて Web Audio で合成する（音声ファイル不要）
let ctx: AudioContext | null = null;
let lastTick = 0;

function ac(): AudioContext | null {
  if (!getState().settings.sound) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** iOS はユーザー操作中に AudioContext を起こす必要がある */
export function unlockAudio(): void {
  const c = ac();
  if (!c) return;
  const buf = c.createBuffer(1, 1, 22050);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  src.start(0);
}

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  at?: number;
  slideTo?: number;
}

function tone(freq: number, dur: number, o: ToneOpts = {}): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur);
  const v = o.vol ?? 0.2;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.2, at = 0, freq = 1200): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

function arpeggio(notes: number[], step: number, o: ToneOpts = {}): void {
  notes.forEach((n, i) => tone(n, step * 2.2, { ...o, at: (o.at ?? 0) + i * step }));
}

export function vibrate(pattern: number | number[]): void {
  // iOS Safari は未対応なので、対応端末のみ
  if (getState().settings.sound && 'vibrate' in navigator) navigator.vibrate(pattern);
}

export const sfx = {
  tick() {
    const now = performance.now();
    if (now - lastTick < 28) return;
    lastTick = now;
    tone(1800, 0.03, { type: 'square', vol: 0.06 });
  },
  tap() {
    tone(660, 0.06, { type: 'triangle', vol: 0.15 });
  },
  start() {
    tone(300, 0.25, { type: 'sawtooth', vol: 0.08, slideTo: 900 });
  },
  stop() {
    tone(140, 0.18, { type: 'square', vol: 0.18, slideTo: 60 });
    noise(0.08, 0.15, 0, 400);
  },
  reach() {
    for (let i = 0; i < 6; i++) tone(440 + i * 70, 0.12, { type: 'square', vol: 0.07, at: i * 0.12 });
  },
  heartbeat() {
    tone(70, 0.12, { vol: 0.5 });
    tone(60, 0.14, { vol: 0.4, at: 0.18 });
  },
  crank() {
    noise(0.06, 0.35, 0, 2500);
    noise(0.06, 0.3, 0.09, 1800);
  },
  drop() {
    tone(500, 0.15, { type: 'triangle', vol: 0.2, slideTo: 200 });
    tone(320, 0.08, { type: 'triangle', vol: 0.15, at: 0.2 });
    tone(260, 0.06, { type: 'triangle', vol: 0.1, at: 0.32 });
  },
  sparkle() {
    arpeggio([1568, 2093, 2637, 3136], 0.05, { vol: 0.08 });
  },
  pop() {
    noise(0.12, 0.4, 0, 3000);
    tone(900, 0.15, { type: 'triangle', vol: 0.2, slideTo: 1800 });
  },
  fanfare(r: Rarity) {
    if (r === 'super') {
      arpeggio([523, 659, 784, 1047, 1319, 1568, 2093], 0.08, { type: 'square', vol: 0.09 });
      arpeggio([523, 659, 784, 1047], 0.0, { type: 'triangle', vol: 0.12, at: 0.65 });
      tone(1047, 0.9, { type: 'square', vol: 0.08, at: 0.65 });
    } else if (r === 'rare') {
      arpeggio([659, 784, 988, 1319], 0.09, { type: 'square', vol: 0.09 });
      tone(1319, 0.6, { type: 'triangle', vol: 0.12, at: 0.36 });
    } else {
      arpeggio([523, 659, 784, 1047], 0.08, { type: 'triangle', vol: 0.14 });
    }
  },
};
