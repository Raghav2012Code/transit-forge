// BPR-style congestion model: t = t0 * (1 + alpha * (v/c)^beta), classic alpha/beta.
import type { CongestionLevel } from '../../types/index.ts';

const BPR_ALPHA = 0.15;
const BPR_BETA = 4;

/** Travel-time ratio (>= 1) for a volume/capacity ratio. */
export function bprRatio(vc: number): number {
  const x = Math.max(0, vc);
  return 1 + BPR_ALPHA * Math.pow(x, BPR_BETA);
}

export function congestionLevel(vc: number): CongestionLevel {
  if (vc < 0.4) return 'free';
  if (vc < 0.65) return 'light';
  if (vc < 0.85) return 'moderate';
  if (vc < 1.0) return 'heavy';
  return 'severe';
}
