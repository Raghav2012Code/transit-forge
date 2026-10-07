import * as THREE from 'three';
import type { CityData } from '../../types/index.ts';
import type { ScenePalette } from '../palette.ts';
import { buildBuildings } from './buildings.ts';
import { buildParks, buildTrees } from './props.ts';
import { BuildingIndex, DiscIndex, discsHitBox, type Disc } from './spatial.ts';
import { buildStreets } from './streets.ts';
import { buildTerrain, riverBanks } from './terrain.ts';

export interface CityMeshes {
  group: THREE.Group;
  buildings: THREE.Group;
  roads: THREE.Group;
  roadMeshById: Map<string, THREE.Mesh>;
  zoneDiscById: Map<string, THREE.Mesh>;
}

/**
 * Static city geometry: the plate, water, streets, blocks, trees. `avoid`
 * lists the circles transit occupies (viaducts, platforms) so no building
 * stands in a line's way.
 */
export function buildCityMeshes(city: CityData, palette: ScenePalette, avoid: Disc[] = [], dark = false): CityMeshes {
  const { mark: MARK } = palette;
  const group = new THREE.Group();
  group.name = 'city';

  group.add(buildTerrain(city, palette, riverBanks(city.river)));

  const { roads, roadMeshById } = buildStreets(city, palette);
  group.add(roads);

  const clear = new DiscIndex(avoid);
  const { group: buildings } = buildBuildings(
    city.buildings,
    palette,
    (b) => discsHitBox(clear, b, 1),
    dark,
  );
  group.add(buildings);

  const parks = buildParks(city, palette);
  if (parks) group.add(parks);
  const kept = city.buildings.filter((b) => !discsHitBox(clear, b, 1));
  const trees = buildTrees(city, palette, new BuildingIndex(kept), clear);
  if (trees) buildings.add(trees);

  // Zone discs (subtle, used for district picking + readability).
  const zoneDiscById = new Map<string, THREE.Mesh>();
  for (const z of city.zones) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(z.radius, 40),
      new THREE.MeshBasicMaterial({ color: MARK.blue, transparent: true, opacity: 0.035, depthWrite: false }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(z.center.x, 0.12, z.center.z);
    disc.userData = { kind: 'zone', id: z.id };
    group.add(disc);
    zoneDiscById.set(z.id, disc);
  }

  return { group, buildings, roads, roadMeshById, zoneDiscById };
}
