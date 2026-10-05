import * as THREE from 'three';
import type { CarTrip, CityData } from '../../types/index.ts';
import type { ScenePalette } from '../palette.ts';

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
  const geo = new THREE.BoxGeometry(4, 1.6, 2);
  geo.translate(0, 1.2, 0);
  const mat = new THREE.MeshStandardMaterial({ color: MARK.car, emissive: MARK.car, emissiveIntensity: 0.1 });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX_VISIBLE_CARS);
  mesh.frustumCulled = false;
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
    dummy.position.set(from.x + (to.x - from.x) * f, 0.6, from.z + (to.z - from.z) * f);
    dummy.rotation.set(0, -Math.atan2(to.z - from.z, to.x - from.x), 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    rig.mesh.setMatrixAt(slot, dummy.matrix);
    slot++;
  }
  for (let i = slot; i < MAX_VISIBLE_CARS; i++) rig.mesh.setMatrixAt(i, HIDDEN);
  rig.mesh.instanceMatrix.needsUpdate = true;
}
