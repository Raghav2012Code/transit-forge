// Selection cycling: when several pickables stack under one click, repeated
// clicks walk the candidate list instead of forcing absurd zoom levels.
// Pure index math; the click plumbing lives in SceneView.
export interface CycleCandidate {
  kind: string;
  id: string;
}

/** Next index, wrapping around the candidate list. */
export function cycleNext(count: number, current: number, dir: 1 | -1 = 1): number {
  if (count <= 0) return -1;
  return (((current + dir) % count) + count) % count;
}

/**
 * Resolve a click to a selection. Same spot as last click (within tolerance
 * and time window) advances through candidates; a new spot starts at the
 * highest-priority candidate (index 0, pre-sorted by the caller).
 */
export interface CycleState {
  x: number;
  y: number;
  at: number;
  index: number;
}

export function resolveClick(
  prev: CycleState | null,
  x: number,
  y: number,
  now: number,
  candidates: CycleCandidate[],
  tolerancePx = 6,
  windowMs = 1500,
): { pick: CycleCandidate | null; state: CycleState | null } {
  if (candidates.length === 0) return { pick: null, state: null };
  const sameSpot =
    prev !== null &&
    Math.hypot(x - prev.x, y - prev.y) <= tolerancePx &&
    now - prev.at <= windowMs;
  const index = sameSpot ? cycleNext(candidates.length, prev.index) : 0;
  return { pick: candidates[index], state: { x, y, at: now, index } };
}
