// Map measurement: straight-line distance plus, where both ends snap to
// stations, the on-network station distance for planning context. Pure math;
// rendering draws the line, the UI formats the label.
export interface MeasurePoints {
  a: { x: number; z: number };
  b: { x: number; z: number };
}

/** Straight-line ground distance in meters. */
export function straightDistance(m: MeasurePoints): number {
  return Math.hypot(m.a.x - m.b.x, m.a.z - m.b.z);
}

/** Display string: spec example is "Distance: 2.4 km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `Distance: ${Math.round(meters)} m`;
  return `Distance: ${Math.round(meters / 100) / 10} km`.replace(/\.0 km$/, ' km');
}

/** Nearest station within snap radius (null when the point is open ground). */
export function snapStation(
  p: { x: number; z: number },
  stations: { id: string; x: number; z: number }[],
  radiusM = 45,
): string | null {
  let best: string | null = null;
  let bestD = radiusM;
  for (const s of stations) {
    const d = Math.hypot(p.x - s.x, p.z - s.z);
    if (d <= bestD) {
      bestD = d;
      best = s.id;
    }
  }
  return best;
}
