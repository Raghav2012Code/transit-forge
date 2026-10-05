import { describe, expect, it } from 'vitest';
import { CAM_MAX_DIST, CAM_MIN_DIST, zoomPose, type CameraPose } from './camera.ts';

const dist = (p: CameraPose) =>
  Math.hypot(p.pos[0] - p.target[0], p.pos[1] - p.target[1], p.pos[2] - p.target[2]);

const pose: CameraPose = { pos: [330, 290, 330], target: [40, 0, 0] };

describe('zoomPose', () => {
  it('moves along the line of sight and keeps the target', () => {
    const z = zoomPose(pose, 0.5);
    expect(z.target).toEqual(pose.target);
    expect(dist(z)).toBeCloseTo(dist(pose) * 0.5, 5);
    // Same direction: the offset vector is only scaled.
    const k = 0.5;
    expect(z.pos[0] - 40).toBeCloseTo((pose.pos[0] - 40) * k, 5);
    expect(z.pos[1]).toBeCloseTo(pose.pos[1] * k, 5);
    expect(z.pos[2]).toBeCloseTo(pose.pos[2] * k, 5);
  });

  it('zooms out as well as in', () => {
    expect(dist(zoomPose(pose, 1.25))).toBeCloseTo(dist(pose) * 1.25, 5);
  });

  it('stops at the controls limits instead of wedging the camera', () => {
    expect(dist(zoomPose(pose, 0.0001))).toBeCloseTo(CAM_MIN_DIST, 5);
    expect(dist(zoomPose(pose, 1000))).toBeCloseTo(CAM_MAX_DIST, 5);
  });

  it('ignores a nonsense factor and a degenerate pose', () => {
    expect(zoomPose(pose, 0)).toBe(pose);
    expect(zoomPose(pose, Number.NaN)).toBe(pose);
    const flat: CameraPose = { pos: [1, 2, 3], target: [1, 2, 3] };
    expect(zoomPose(flat, 0.5)).toBe(flat);
  });
});
