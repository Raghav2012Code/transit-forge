// Pure camera math for the planning camera: named presets, point framing,
// tilt variants. No THREE dependency — poses are plain tuples and SceneView
// converts them. All distances are clamped to the controls' limits so a
// preset can never wedge the camera somewhere unreachable.
export type TiltName = 'top' | 'perspective' | 'street';

export interface CameraPose {
  pos: [number, number, number];
  target: [number, number, number];
}

export interface MapAnchor {
  x: number;
  z: number;
  /** Characteristic radius (district radius, station spacing, …). */
  radius: number;
}

export const CAM_MIN_DIST = 60;
export const CAM_MAX_DIST = 1000;

function clampDist(d: number): number {
  return Math.min(CAM_MAX_DIST, Math.max(CAM_MIN_DIST, d));
}

/** Position for a target + distance + tilt. */
export function poseFor(target: { x: number; z: number }, dist: number, tilt: TiltName): CameraPose {
  const d = clampDist(dist);
  if (tilt === 'top') return { pos: [target.x, d, target.z + 0.01], target: [target.x, 0, target.z] };
  if (tilt === 'street') {
    return {
      pos: [target.x + d * 0.85, Math.max(18, d * 0.22), target.z + d * 0.4],
      target: [target.x, 0, target.z],
    };
  }
  return {
    pos: [target.x + d * 0.55, d * 0.75, target.z + d * 0.55],
    target: [target.x, 0, target.z],
  };
}

/** Frame a set of ground points: centroid target, spread-derived distance. */
export function focusPoints(points: { x: number; z: number }[], tilt: TiltName = 'perspective'): CameraPose {
  if (points.length === 0) return poseFor({ x: 40, z: 0 }, 480, tilt);
  let cx = 0;
  let cz = 0;
  for (const p of points) {
    cx += p.x;
    cz += p.z;
  }
  cx /= points.length;
  cz /= points.length;
  let spread = 0;
  for (const p of points) spread = Math.max(spread, Math.hypot(p.x - cx, p.z - cz));
  return poseFor({ x: cx, z: cz }, spread * 1.9 + 90, tilt);
}

export type PresetId = 'overview' | 'cbd' | 'airport' | 'university' | 'harbor' | 'industrial' | 'central';

export interface PresetInput {
  zones: { id: string; kind: string; center: { x: number; z: number }; radius: number }[];
  central: { x: number; z: number } | null;
}

/** Named planning views derived from live city data (never hard-coded coords). */
export function cameraPreset(id: PresetId, input: PresetInput, tilt: TiltName = 'perspective'): CameraPose {
  if (id === 'overview') {
    const pts = input.zones.map((z) => ({ x: z.center.x, z: z.center.z }));
    return focusPoints(pts, tilt);
  }
  if (id === 'central' && input.central) return poseFor(input.central, 150, tilt);
  const kind = id === 'cbd' ? 'cbd' : id === 'airport' ? 'airport' : id === 'university' ? 'university' : id === 'harbor' ? 'harbor' : 'industrial';
  const zone = input.zones.find((z) => z.kind === kind);
  if (!zone) return focusPoints(input.zones.map((z) => ({ x: z.center.x, z: z.center.z })), tilt);
  return poseFor(zone.center, zone.radius * 2.4 + 80, tilt);
}

/**
 * Dolly toward (factor < 1) or away from (factor > 1) the point being looked
 * at, along the current line of sight, within the controls' distance limits.
 */
export function zoomPose(pose: CameraPose, factor: number): CameraPose {
  const [px, py, pz] = pose.pos;
  const [tx, ty, tz] = pose.target;
  const dx = px - tx;
  const dy = py - ty;
  const dz = pz - tz;
  const dist = Math.hypot(dx, dy, dz);
  if (dist <= 0 || !Number.isFinite(factor) || factor <= 0) return pose;
  const k = clampDist(dist * factor) / dist;
  return { pos: [tx + dx * k, ty + dy * k, tz + dz * k], target: pose.target };
}

/** Camera command envelope: SceneView applies a command once per sequence id. */
export interface CameraCmd {
  seq: number;
  pose: CameraPose;
}
