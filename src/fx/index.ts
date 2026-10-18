import type { Candidate, EffectId, Rarity } from '../types';
import { fukubiki } from './fukubiki';
import { gacha } from './gacha';
import { omikuji } from './omikuji';
import { plinko } from './plinko';
import { race } from './race';
import { roulette } from './roulette';
import { slot } from './slot';
import { sushi } from './sushi';

export interface FxContext {
  /** 演出を描画する領域 */
  stage: HTMLElement;
  cands: Candidate[];
  /** 先に重み付き乱数で決まった当選。演出はここに着地させる */
  winner: Candidate;
  rarity: Rarity;
  /** スキップ時に abort される */
  signal: AbortSignal;
}

export type Fx = (ctx: FxContext) => Promise<void>;

export const EFFECTS: Record<EffectId, { label: string; icon: string; run: Fx }> = {
  roulette: { label: 'ルーレット', icon: '🎡', run: roulette },
  slot: { label: 'スロット', icon: '🎰', run: slot },
  gacha: { label: 'ガチャ', icon: '🎱', run: gacha },
  fukubiki: { label: '福引', icon: '🔴', run: fukubiki },
  omikuji: { label: 'おみくじ', icon: '🎋', run: omikuji },
  sushi: { label: '回転寿司', icon: '🍣', run: sushi },
  race: { label: 'レース', icon: '🏇', run: race },
  plinko: { label: 'プリンコ', icon: '⚪', run: plinko },
};

export const EFFECT_IDS = Object.keys(EFFECTS) as EffectId[];
