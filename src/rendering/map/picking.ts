import type { Object3D } from 'three';

/** Pointer travel (px) above which a release is a drag, not a click. */
export const DRAG_THRESHOLD_PX = 4;

/** True when the pointer moved far enough between down and up to be a drag. */
export function isDrag(dx: number, dy: number, threshold = DRAG_THRESHOLD_PX): boolean {
  return dx * dx + dy * dy > threshold * threshold;
}

/** True when the object and every ancestor is visible; hidden layers never pick. */
export function isVisibleInChain(obj: Object3D): boolean {
  for (let o: Object3D | null = obj; o; o = o.parent) {
    if (!o.visible) return false;
  }
  return true;
}

/** Plan-space midpoint of a road edge; the renderer lifts it to a height. */
export function edgeMidpointXZ(
  a: { x: number; z: number },
  b: { x: number; z: number },
): { x: number; z: number } {
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}
