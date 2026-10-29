import { describe, expect, it } from 'vitest';
import { CAM_MAX_DIST, CAM_MIN_DIST, poseFor, zoomPose, type CameraPose } from './camera.ts';
import { WORLD_SCALE } from '../../simulation/city/geography.ts';

const S = WORLD_SCALE;

const dist = (p: CameraPose) =>
  Math.hypot(p.pos[0] - p.target[0], p.pos[1] - p.target[1], p.pos[2] - p.target[2]);

// A pose at the world's scale, so the zoom factor lands inside the (scaled)
// control limits and is not clamped.
const pose: CameraPose = { pos: [330 * S, 290 * S, 330 * S], target: [40 * S, 0, 0] };

describe('zoomPose', () => {
  it('moves along the line of sight and keeps the target', () => {
    const z = zoomPose(pose, 0.5);
    expect(z.target).toEqual(pose.target);
    expect(dist(z)).toBeCloseTo(dist(pose) * 0.5, 5);
    // Same direction: the offset vector is only scaled.
    const k = 0.5;
    expect(z.pos[0] - 40 * S).toBeCloseTo((pose.pos[0] - 40 * S) * k, 5);
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

describe('poseFor', () => {
  it('lands exactly on the clamp instead of overshooting it', () => {
    const far = poseFor({ x: 40 * S, z: 0 }, CAM_MAX_DIST * 10, 'perspective');
    expect(dist(far)).toBeCloseTo(CAM_MAX_DIST, 6);
    const near = poseFor({ x: 40 * S, z: 0 }, 1, 'perspective');
    expect(dist(near)).toBeCloseTo(CAM_MIN_DIST, 6);
  });

  it('keeps the requested distance when it is inside the limits', () => {
    expect(dist(poseFor({ x: 0, z: 0 }, 400 * S, 'perspective'))).toBeCloseTo(400 * S, 6);
  });
});
