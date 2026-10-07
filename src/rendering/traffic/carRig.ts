import * as THREE from 'three';
import type { CarTrip, CityData } from '../../types/index.ts';
import type { ScenePalette } from '../palette.ts';
import { merge } from '../transport/sweep.ts';

/** Representative subset of cars as one InstancedMesh (never one object per car). */
export const MAX_VISIBLE_CARS = 60;

export interface CarRig {
  group: THREE.Group;
  mesh: THREE.InstancedMesh;
  nodePos: Map<string, { x: number; z: number }>;
}

export function buildCarRig(city: CityData, palette: ScenePalette): CarRig {
  const MARK = palette.mark;
  const group = new THREE.Group();
  group.name = 'cars';
  // A saloon: body, glass cabin, long axis +x. Vertex colours carry body (1) and glass (dark).
  const part = (w: number, h: number, d: number, x: number, y: number, shade: number) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.translate(x, y + h / 2, 0);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(shade), 3));
    return g;
  };
  const geo = merge([part(4.2, 0.85, 1.9, 0, 0.35, 1), part(2.3, 0.7, 1.7, -0.2, 1.2, 0.16), part(2.1, 0.12, 1.55, -0.2, 1.9, 0.9)]);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, vertexColors: true });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX_VISIBLE_CARS);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const paints = [MARK.car, 0xe5e8ec, 0x9aa3b0, 0x4b5563, 0xc7ccd4, 0x7b8696];
  for (let i = 0; i < MAX_VISIBLE_CARS; i++) mesh.setColorAt(i, new THREE.Color(paints[i % paints.length]));
  group.add(mesh);
  const nodePos = new Map(city.roadNodes.map((n) => [n.id, { x: n.pos.x, z: n.pos.z }]));
  return { group, mesh, nodePos };
}

const dummy = new THREE.Object3D();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** Stride-sample active cars so the subset stays representative at any load. */
export function updateCarRig(rig: CarRig, cars: CarTrip[], edgeLen: Map<string, number>): void {
  const driving = cars.filter((c) => c.state === 'DRIVING');
  const stride = Math.max(1, Math.ceil(driving.length / MAX_VISIBLE_CARS));
  let slot = 0;
  for (let i = 0; i < driving.length && slot < MAX_VISIBLE_CARS; i += stride) {
    const car = driving[i];
    const from = rig.nodePos.get(car.nodes[car.edgeIndex] ?? '');
    const to = rig.nodePos.get(car.nodes[car.edgeIndex + 1] ?? '');
    const edgeId = car.edgeIds[car.edgeIndex];
    const len = (edgeId ? edgeLen.get(edgeId) : undefined) ?? 1;
    if (!from || !to) {
      rig.mesh.setMatrixAt(slot, HIDDEN);
      slot++;
      continue;
    }
    const f = Math.min(1, Math.max(0, car.s / Math.max(1, len)));
    // Drive on the right: a lane's width off the centre line.
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dl = Math.hypot(dx, dz) || 1;
    dummy.position.set(from.x + dx * f - (dz / dl) * 1.5, 0.5, from.z + dz * f + (dx / dl) * 1.5);
    dummy.rotation.set(0, -Math.atan2(dz, dx), 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    rig.mesh.setMatrixAt(slot, dummy.matrix);
    slot++;
  }
  for (let i = slot; i < MAX_VISIBLE_CARS; i++) rig.mesh.setMatrixAt(i, HIDDEN);
  rig.mesh.instanceMatrix.needsUpdate = true;
}
