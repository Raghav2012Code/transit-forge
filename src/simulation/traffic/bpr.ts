// BPR-style congestion model behind a replaceable interface.
// t = t0 * (1 + alpha * (v/c)^beta). Defaults are classic BPR alpha/beta.
import type { CongestionLevel } from '../../types/index.ts';

export interface CongestionParams {
  alpha: number;
  beta: number;
}

export const DEFAULT_BPR: CongestionParams = { alpha: 0.15, beta: 4 };

/** Travel-time ratio (>= 1) for a volume/capacity ratio. */
export function bprRatio(vc: number, params: CongestionParams = DEFAULT_BPR): number {
  const x = Math.max(0, vc);
  return 1 + params.alpha * Math.pow(x, params.beta);
}

export function congestedMinutes(freeMin: number, vc: number, params: CongestionParams = DEFAULT_BPR): number {
  return freeMin * bprRatio(vc, params);
}

export function congestionLevel(vc: number): CongestionLevel {
  if (vc < 0.4) return 'free';
  if (vc < 0.65) return 'light';
  if (vc < 0.85) return 'moderate';
  if (vc < 1.0) return 'heavy';
  return 'severe';
}
