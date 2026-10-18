import type { Candidate, EffectId, Rarity } from '../types';
import { gacha } from './gacha';
import { roulette } from './roulette';
import { slot } from './slot';

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
};

export const EFFECT_IDS = Object.keys(EFFECTS) as EffectId[];
