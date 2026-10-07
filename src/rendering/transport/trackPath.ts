import * as THREE from 'three';

/**
 * A route's drawn alignment: straight where it meets a station, a smooth
 * easement between stations. Every consumer (the line mesh, the viaduct, the
 * trains, the direction cones, the stations' orientation) reads this one
 * curve, so a vehicle can never be off its line.
 *
 * Arc lengths here are scene metres. The simulation measures a route in
 * straight-chord metres, so `knots` records where each station sits along the
 * curve and `arcAtSim` converts between the two piecewise.
 */
export class TrackCurve extends THREE.Curve<THREE.Vector3> {
  readonly pts: THREE.Vector3[];
  readonly cum: number[];
  readonly length: number;
  /** Arc length at each station, aligned with the route's station list. */
  readonly knots: number[];
  /** Unit heading (xz) the track holds through each station. */
  readonly headings: THREE.Vector3[];
  /** Simulation distance (chord metres) at each station. */
  readonly simKnots: number[];

  constructor(pts: THREE.Vector3[], knots: number[], headings: THREE.Vector3[], simKnots: number[]) {
    super();
    this.pts = pts;
    this.knots = knots;
    this.headings = headings;
    this.simKnots = simKnots;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.cum = cum;
    this.length = cum[cum.length - 1] ?? 0;
  }

  override getLength(): number {
    return this.length;
  }

  /** Index i such that cum[i] <= s < cum[i+1]. */
  private seek(s: number): number {
    let lo = 0;
    let hi = this.cum.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cum[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  pointAtArc(s: number, target = new THREE.Vector3()): THREE.Vector3 {
    const c = Math.min(Math.max(s, 0), this.length);
    const i = this.seek(c);
    const a = this.pts[i];
    const b = this.pts[i + 1] ?? a;
    const span = this.cum[i + 1] !== undefined ? this.cum[i + 1] - this.cum[i] : 0;
    const f = span > 1e-9 ? (c - this.cum[i]) / span : 0;
    return target.lerpVectors(a, b, f);
  }

  tangentAtArc(s: number, target = new THREE.Vector3()): THREE.Vector3 {
    const c = Math.min(Math.max(s, 0), this.length);
    const i = this.seek(c);
    const a = this.pts[i];
    const b = this.pts[i + 1] ?? a;
    target.subVectors(b, a);
    return target.lengthSq() > 1e-12 ? target.normalize() : target.set(1, 0, 0);
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    return this.pointAtArc(t * this.length, target);
  }

  override getPointAt(u: number, target = new THREE.Vector3()): THREE.Vector3 {
    return this.pointAtArc(u * this.length, target);
  }

  override getTangentAt(u: number, target = new THREE.Vector3()): THREE.Vector3 {
    return this.tangentAtArc(u * this.length, target);
  }

  override getTangent(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    return this.tangentAtArc(t * this.length, target);
  }

  /** Scene arc length for a simulation distance (chord metres along the route). */
  arcAtSim(s: number): number {
    const k = this.simKnots;
    if (k.length < 2) return 0;
    if (s <= 0) return this.knots[0] ?? 0;
    const last = k.length - 1;
    if (s >= k[last]) return this.knots[last];
    let lo = 0;
    let hi = last - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (k[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    const span = k[lo + 1] - k[lo];
    const f = span > 1e-9 ? (s - k[lo]) / span : 0;
    return this.knots[lo] + (this.knots[lo + 1] - this.knots[lo]) * f;
  }
}

const STUB_M = 15; // straight lead-in/out at every station, so platforms sit on straight track

function heading(prev: THREE.Vector3, here: THREE.Vector3, next: THREE.Vector3): THREE.Vector3 {
  const d = new THREE.Vector3(next.x - prev.x, 0, next.z - prev.z);
  if (d.lengthSq() < 1e-6) d.set(next.x - here.x, 0, next.z - here.z);
  if (d.lengthSq() < 1e-6) d.set(1, 0, 0);
  return d.normalize();
}

/** Build the alignment through `stations` (their x/z; y is taken from `y`). */
export function buildTrackCurve(stations: { x: number; z: number }[], y: number): TrackCurve | null {
  if (stations.length < 2) return null;
  const P = stations.map((s) => new THREE.Vector3(s.x, y, s.z));
  const H = P.map((p, i) => heading(P[i - 1] ?? p, p, P[i + 1] ?? p));
  const pts: THREE.Vector3[] = [P[0].clone()];
  const knots: number[] = [0];
  const simKnots: number[] = [0];
  let run = 0;
  let simRun = 0;
  const push = (v: THREE.Vector3) => {
    run += v.distanceTo(pts[pts.length - 1]);
    pts.push(v);
  };
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i];
    const b = P[i + 1];
    const chord = a.distanceTo(b);
    simRun += chord;
    const stub = Math.min(STUB_M, chord * 0.22);
    const a1 = a.clone().addScaledVector(H[i], stub);
    const b1 = b.clone().addScaledVector(H[i + 1], -stub);
    const k = a1.distanceTo(b1) * 0.42;
    const curve = new THREE.CubicBezierCurve3(
      a1,
      a1.clone().addScaledVector(H[i], k),
      b1.clone().addScaledVector(H[i + 1], -k),
      b1,
    );
    push(a1);
    const n = Math.max(8, Math.min(48, Math.ceil(chord / 5)));
    for (let j = 1; j < n; j++) push(curve.getPoint(j / n));
    push(b1);
    push(b.clone());
    knots.push(run);
    simKnots.push(simRun);
  }
  return new TrackCurve(pts, knots, H, simKnots);
}
