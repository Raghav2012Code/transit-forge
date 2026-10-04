import { describe, expect, it } from 'vitest';
import { CAM_MAX_DIST, CAM_MIN_DIST, cameraPreset, focusPoints, poseFor } from './camera.ts';
import { generateCity } from '../../simulation/city/generateCity.ts';
import { buildNetwork } from '../../simulation/transport/network.ts';

const input = () => {
  const city = generateCity(1337);
  const net = buildNetwork();
  const central = net.stations.find((s) => s.id === 'st-central');
  return {
    zones: city.zones.map((z) => ({ id: z.id, kind: z.kind, center: { x: z.center.x, z: z.center.z }, radius: z.radius })),
    central: central ? { x: central.pos.x, z: central.pos.z } : null,
  };
};

describe('camera presets', () => {
  it('frames the whole city for overview', () => {
    const pose = cameraPreset('overview', input());
    const city = generateCity(1337);
    // Every district center must lie within the framed distance of target.
    const [tx, , tz] = pose.target;
    const dist = Math.hypot(pose.pos[0] - tx, pose.pos[1], pose.pos[2] - tz);
    for (const z of city.zones) {
      expect(Math.hypot(z.center.x - tx, z.center.z - tz)).toBeLessThanOrEqual(dist);
    }
  });

  it('targets real anchors for district presets', () => {
    const inp = input();
    const airport = cameraPreset('airport', inp);
    expect(airport.target[0]).toBe(470);
    expect(airport.target[2]).toBe(-40);
    const cbd = cameraPreset('cbd', inp);
    expect(cbd.target).toEqual([0, 0, 0]);
    const central = cameraPreset('central', inp);
    expect(central.target).toEqual([0, 0, 0]);
  });

  it('clamps every pose to the controls limits', () => {
    expect(poseFor({ x: 0, z: 0 }, 5, 'perspective').pos[1]).toBeGreaterThanOrEqual(CAM_MIN_DIST * 0.5);
    const far = poseFor({ x: 0, z: 0 }, 99999, 'top');
    expect(Math.hypot(far.pos[0], far.pos[1], far.pos[2])).toBeLessThanOrEqual(CAM_MAX_DIST + 1);
  });

  it('focuses point sets on their centroid with spread-scaled distance', () => {
    const near = focusPoints([{ x: 0, z: 0 }]);
    expect(near.target).toEqual([0, 0, 0]);
    const wide = focusPoints([{ x: -400, z: 0 }, { x: 400, z: 0 }]);
    const dNear = Math.hypot(...[near.pos[0] - 0, near.pos[1], near.pos[2] - 0] as [number, number, number]);
    const dWide = Math.hypot(...[wide.pos[0] - 0, wide.pos[1], wide.pos[2] - 0] as [number, number, number]);
    expect(dWide).toBeGreaterThan(dNear);
    expect(focusPoints([]).target).toEqual([40, 0, 0]);
  });
});
