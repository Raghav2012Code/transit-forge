// Minimap math: world→SVG projection plus the camera view wedge.
// The minimap is a lightweight SVG (no second WebGL context); this module
// holds every number it needs. Pure and deterministic.
export interface MinimapFrame {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  w: number;
  h: number;
}

/** Fit frame around points with padding, preserving no aspect (SVG scales). */
export function frameFor(points: { x: number; z: number }[], w: number, h: number, pad = 40): MinimapFrame {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  if (!Number.isFinite(minX)) {
    minX = -500;
    maxX = 500;
    minZ = -400;
    maxZ = 400;
  }
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad, w, h };
}

export function project(f: MinimapFrame, x: number, z: number): [number, number] {
  const sx = ((x - f.minX) / Math.max(1e-6, f.maxX - f.minX)) * f.w;
  const sy = ((z - f.minZ) / Math.max(1e-6, f.maxZ - f.minZ)) * f.h;
  return [sx, sy];
}

/**
 * View wedge polygon (apex at camera, spread toward target): a triangle in
 * SVG coords showing where the main camera looks.
 */
export function cameraWedge(
  f: MinimapFrame,
  cam: { x: number; z: number },
  target: { x: number; z: number },
  dist: number,
): [number, number][] {
  const dx = target.x - cam.x;
  const dz = target.z - cam.z;
  const len = Math.hypot(dx, dz);
  const ux = len > 1e-6 ? dx / len : 1;
  const uz = len > 1e-6 ? dz / len : 0;
  // Half-angle ~25° matching the 50° main-camera FOV.
  const cos = Math.cos(0.44);
  const sin = Math.sin(0.44);
  const reach = Math.min(Math.max(120, dist * 1.1), Math.hypot(f.maxX - f.minX, f.maxZ - f.minZ));
  const lx = cam.x + (ux * cos - uz * sin) * reach;
  const lz = cam.z + (ux * sin + uz * cos) * reach;
  const rx = cam.x + (ux * cos + uz * sin) * reach;
  const rz = cam.z + (-ux * sin + uz * cos) * reach;
  return [project(f, cam.x, cam.z), project(f, lx, lz), project(f, rx, rz)];
}

/** Inverse: SVG point back to world coords (click-to-move). */
export function unproject(f: MinimapFrame, sx: number, sy: number): { x: number; z: number } {
  return {
    x: f.minX + (sx / Math.max(1e-6, f.w)) * (f.maxX - f.minX),
    z: f.minZ + (sy / Math.max(1e-6, f.h)) * (f.maxZ - f.minZ),
  };
}
