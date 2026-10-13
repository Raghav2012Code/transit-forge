// The fixed geography of the city: where the sea ends and where the river runs.
// One definition, read by the generator, the placement rules, the gap analysis
// and (through the city data) the map, so what is drawn is what is enforced.

/**
 * One ruler for the whole world. Positions multiply by it; speeds, headways,
 * dwells, street widths and building envelopes do not. Bumping it enlarges the
 * city in real metres without enlarging the things that stand in it.
 */
export const WORLD_SCALE = 5;
const S = WORLD_SCALE;

/** Half-width of the river as drawn. */
export const RIVER_HALF_M = 13 * S;

/** Limits of the buildable city (the plate is larger; nothing is built past these). */
export const CITY_BOUNDS = { x: 600 * S, z: 420 * S } as const;

/** Where the shore is at depth z: land lies to the east of it. */
export function coastXAt(z: number): number {
  return -322 * S + 10 * S * Math.sin(z / (95 * S) + 0.6) + 5 * S * Math.sin(z / (31 * S));
}

/** Centre of the river at depth z. The river runs north to south with a gentle meander. */
export function riverCentreX(z: number): number {
  return 120 * S + Math.sin(((z + 420 * S) / (42 * S)) * 0.7) * (28 * S);
}

/** Does a straight segment cross, or lie in, the river? */
export function crossesRiver(ax: number, az: number, bx: number, bz: number): boolean {
  const steps = 32;
  let lastSide = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const off = x - riverCentreX(z);
    if (Math.abs(off) < RIVER_HALF_M) return true;
    const side = Math.sign(off);
    if (lastSide !== 0 && side !== lastSide) return true;
    lastSide = side;
  }
  return false;
}
