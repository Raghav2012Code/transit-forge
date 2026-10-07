// Deterministic fictional coastal megacity. Same seed => same city.
// Geography: coast west (x < -320 water), river north-south at x ~= 120,
// harbor bay south-west, airport far east on flat land.
import type { CityData, DistrictKind, Vec3, Zone } from '../../types/index.ts';
import { mulberry32 } from './seededRng.ts';
import { distM as dist2D } from '../transport/network.ts';
import { initGrowthState } from '../growth/landUse.ts';
import { riverCentreX } from './geography.ts';
import { coastXAt, layoutCity, riverXAt, roadSegments } from './layout.ts';

interface ZoneSpec {
  id: string;
  name: string;
  kind: DistrictKind;
  x: number;
  z: number;
  radius: number;
  population: number;
  jobs: number;
}

const ZONE_SPECS: ZoneSpec[] = [
  { id: 'z-cbd', name: 'Central CBD', kind: 'cbd', x: 0, z: 0, radius: 130, population: 45000, jobs: 120000 },
  { id: 'z-harbor', name: 'Port Harbor', kind: 'harbor', x: -260, z: 210, radius: 110, population: 12000, jobs: 28000 },
  { id: 'z-univ', name: 'University Hill', kind: 'university', x: 170, z: -190, radius: 120, population: 38000, jobs: 18000 },
  { id: 'z-ind', name: 'East Industrial', kind: 'industrial', x: 300, z: 170, radius: 130, population: 15000, jobs: 55000 },
  { id: 'z-air', name: 'Aurora Airport', kind: 'airport', x: 470, z: -40, radius: 120, population: 3000, jobs: 22000 },
  { id: 'z-res-n', name: 'North Residences', kind: 'residential', x: -40, z: -260, radius: 150, population: 95000, jobs: 12000 },
  { id: 'z-res-w', name: 'West Residences', kind: 'residential', x: -220, z: -60, radius: 140, population: 80000, jobs: 9000 },
  { id: 'z-res-e', name: 'East Residences', kind: 'residential', x: 250, z: -20, radius: 140, population: 70000, jobs: 10000 },
  { id: 'z-sub-s', name: 'South Suburbs', kind: 'suburban', x: 40, z: 300, radius: 160, population: 60000, jobs: 8000 },
  { id: 'z-sub-ne', name: 'North-East Suburbs', kind: 'suburban', x: 330, z: -300, radius: 150, population: 52000, jobs: 6000 },
];

const LAYOUTS = new Map<number, ReturnType<typeof layoutCity>>();

export function generateCity(seed: number): CityData {
  const zones: Zone[] = ZONE_SPECS.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    center: { x: s.x, y: 0, z: s.z },
    radius: s.radius,
    population: s.population,
    jobs: s.jobs,
    students: 0,
    households: 0,
    capacityPop: 0,
    capacityJobs: 0,
    developed01: 0,
    attractiveness: 50,
    accessScore: 50,
    accessMem: 50,
    popGrowthRate: 0,
    jobGrowthRate: 0,
  }));
  for (const z of zones) initGrowthState(z);

  // River polyline (north -> south) at x ~= 120 with gentle meander.
  const river: Vec3[] = [];
  for (let i = 0; i <= 20; i++) {
    const z = -420 + (i / 20) * 840;
    const x = riverCentreX(z);
    river.push({ x, y: 0, z });
  }

  // Bridges carry the three east-west arterials over the river.
  const bridges = [-300, 0, 300].map((z, i) => {
    const x = riverXAt(river, z);
    return {
      id: ['br-north', 'br-central', 'br-south'][i],
      a: { x: x - 50, y: 0, z },
      b: { x: x + 50, y: 0, z },
    };
  });

  // Major roads: deformed grid arterials + ring, as data (meshes derived).
  const roadNodes = [
    { id: 'rn-w1', pos: { x: -300, y: 0, z: -300 } },
    { id: 'rn-w2', pos: { x: -300, y: 0, z: 0 } },
    { id: 'rn-w3', pos: { x: -300, y: 0, z: 300 } },
    { id: 'rn-c1', pos: { x: 0, y: 0, z: -300 } },
    { id: 'rn-c2', pos: { x: 0, y: 0, z: 0 } },
    { id: 'rn-c3', pos: { x: 0, y: 0, z: 300 } },
    { id: 'rn-e1', pos: { x: 300, y: 0, z: -300 } },
    { id: 'rn-e2', pos: { x: 300, y: 0, z: 0 } },
    { id: 'rn-e3', pos: { x: 300, y: 0, z: 300 } },
    { id: 'rn-a1', pos: { x: 520, y: 0, z: 0 } },
  ];
  const edgePairs: [string, string, boolean, boolean][] = [
    ['rn-w1', 'rn-c1', true, false],
    ['rn-c1', 'rn-e1', true, true],
    ['rn-w2', 'rn-c2', true, false],
    ['rn-c2', 'rn-e2', true, true],
    ['rn-w3', 'rn-c3', true, false],
    ['rn-c3', 'rn-e3', true, true],
    ['rn-e2', 'rn-a1', true, false],
    ['rn-w1', 'rn-w2', false, false],
    ['rn-w2', 'rn-w3', false, false],
    ['rn-c1', 'rn-c2', false, false],
    ['rn-c2', 'rn-c3', false, false],
    ['rn-e1', 'rn-e2', false, false],
    ['rn-e2', 'rn-e3', false, false],
  ];
  const nodeById = new Map(roadNodes.map((n) => [n.id, n]));
  const roadEdges = edgePairs.map(([a, b, arterial, bridge], i) => {
    const na = nodeById.get(a);
    const nb = nodeById.get(b);
    const lengthM = na && nb ? dist2D(na.pos, nb.pos) : 300;
    return {
      id: `re-${i}`,
      a,
      b,
      lengthM,
      lanes: arterial ? 4 : 2,
      isBridge: bridge,
      isArterial: arterial,
    };
  });

  // Streets, blocks and buildings (render-only; see layout.ts).
  // Nothing mutates the layout (growth changes zones, not blocks), so one copy per seed is shared.
  let layout = LAYOUTS.get(seed);
  if (!layout) {
    layout = layoutCity({ zones, river, roadSegs: roadSegments(roadNodes, roadEdges) }, mulberry32(seed));
    LAYOUTS.set(seed, layout);
  }
  const { buildings, streets, parks, landmarks } = layout;

  // Shoreline, north to south.
  const coast: Vec3[] = [];
  for (let z = -660; z <= 660; z += 20) coast.push({ x: coastXAt(z), y: 0, z });

  return { zones, roadNodes, roadEdges, buildings, river, bridges, coast, streets, parks, landmarks };
}
