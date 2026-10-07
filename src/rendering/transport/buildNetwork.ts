import * as THREE from 'three';
import type { Station, TransportMode, TransportRoute } from '../../types/index.ts';
import type { ScenePalette } from '../palette.ts';
import { buildTrackCurve, type TrackCurve } from './trackPath.ts';
import { merge, rectProfile, sweep, tint } from './sweep.ts';

/** Height of the running surface for each mode. Buses use the street. */
export const MODE_Y: Record<TransportMode, number> = {
  metro: 6.5,
  rail: 9.5,
  bus: 0.55,
  road: 0.55,
};

const BAND_W: Record<TransportMode, number> = { metro: 3.2, rail: 3.6, bus: 3.4, road: 3 };
const DECK_W: Record<TransportMode, number> = { metro: 6.4, rail: 7.2, bus: 0, road: 0 };
const DECK_T = 1.5;
const PLATFORM_LEN: Record<TransportMode, number> = { metro: 34, rail: 42, bus: 16, road: 16 };

export interface NetworkMeshes {
  group: THREE.Group;
  byMode: Record<TransportMode, THREE.Group>;
  pickables: THREE.Object3D[];
  stationMeshById: Map<string, THREE.Mesh>;
  routeMeshById: Map<string, THREE.Mesh>;
  curves: Map<string, TrackCurve>;
  /** Points the city should keep clear of: a circle per sample along each line. */
  avoid: { x: number; z: number; r: number }[];
}

/** The drawn alignment of one route; trains, line mesh and stations all read this. */
export function routeCurve(route: TransportRoute, byId: Map<string, Station>): TrackCurve | null {
  const pts = route.stationIds
    .map((id) => byId.get(id))
    .filter((s): s is Station => Boolean(s))
    .map((s) => ({ x: s.pos.x, z: s.pos.z }));
  return buildTrackCurve(pts, MODE_Y[route.mode]);
}

function boxAt(w: number, h: number, d: number, x: number, y: number, z: number, yaw: number, shade: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateY(yaw);
  g.translate(x, y, z);
  return tint(g.toNonIndexed(), shade);
}

/** Offset (along, across) in a frame turned to `yaw` (local z = along the track). */
function frame(yaw: number, along: number, across: number): [number, number] {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  return [along * s + across * c, along * c - across * s];
}

interface LevelInfo {
  mode: TransportMode;
  yaw: number;
}

function stationGeometry(levels: LevelInfo[], yTop: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const ground = -yTop + MODE_Y.bus;
  for (const { mode, yaw } of levels) {
    const y0 = MODE_Y[mode] - yTop;
    const len = PLATFORM_LEN[mode];
    const put = (w: number, h: number, d: number, along: number, across: number, y: number, shade: number) => {
      const [x, z] = frame(yaw, along, across);
      parts.push(boxAt(w, h, d, x, y, z, yaw, shade));
    };
    if (mode === 'metro' || mode === 'rail') {
      put(9.6, 1.4, len, 0, 0, y0 - 0.6, 0.72);
      // Edge strips either side of the track, so the platform reads as a platform.
      put(0.5, 0.12, len, 0, 4.5, y0 + 0.14, 0.4);
      put(0.5, 0.12, len, 0, -4.5, y0 + 0.14, 0.4);
      // Roof on four posts.
      put(8.8, 0.4, len - 6, 0, 0, y0 + 4.9, 1);
      for (const a of [-1, 1]) for (const c of [-1, 1]) put(0.5, 4.6, 0.5, a * (len / 2 - 4), c * 4, y0 + 2.5, 0.6);
      // Columns to the ground, and a stair core to one side.
      const colH = y0 - 1.3 - ground;
      for (const a of [-1, 1]) put(2.4, colH, 2.4, a * (len / 2 - 7), 0, ground + colH / 2, 0.72);
      put(3.2, y0 - 0.2 - ground, 4.2, 0, 7.2, ground + (y0 - 0.2 - ground) / 2, 0.78);
      put(3.4, 0.35, 4.6, 0, 7.2, y0 + 2.6 - 0.2, 0.95);
    } else {
      put(4.4, 0.3, len, 0, 0, ground + 0.15, 0.86);
      put(3.8, 0.25, len - 2, 0, 0, ground + 3.4, 1);
      for (const a of [-1, 1]) put(0.3, 3.3, 0.3, a * (len / 2 - 2), 1.6, ground + 1.7, 0.7);
    }
  }
  return merge(parts);
}

export function buildNetworkMeshes(stations: Station[], routes: TransportRoute[], palette: ScenePalette): NetworkMeshes {
  const STATION = palette.station;
  const TRACK = palette.track;
  const group = new THREE.Group();
  group.name = 'network';
  const byMode: Record<TransportMode, THREE.Group> = {
    metro: new THREE.Group(),
    rail: new THREE.Group(),
    bus: new THREE.Group(),
    road: new THREE.Group(),
  };
  byMode.metro.name = 'metro';
  byMode.rail.name = 'rail';
  byMode.bus.name = 'bus';
  const pickables: THREE.Object3D[] = [];
  const byId = new Map(stations.map((s) => [s.id, s]));
  const routeMeshById = new Map<string, THREE.Mesh>();
  const curves = new Map<string, TrackCurve>();
  const avoid: { x: number; z: number; r: number }[] = [];
  const deckMat = new THREE.MeshStandardMaterial({ color: TRACK.deck, roughness: 0.92 });
  const pierMat = new THREE.MeshStandardMaterial({ color: TRACK.pier, roughness: 0.95 });
  const piers: Record<'metro' | 'rail', THREE.BufferGeometry[]> = { metro: [], rail: [] };

  for (const route of routes) {
    const curve = routeCurve(route, byId);
    if (!curve) continue;
    curves.set(route.id, curve);
    const elevated = route.mode === 'metro' || route.mode === 'rail';
    const y0 = MODE_Y[route.mode];

    const band = new THREE.Mesh(
      sweep(curve, rectProfile(BAND_W[route.mode], 0, elevated ? 0.5 : 0.1), y0, 0, curve.length, 2.5),
      new THREE.MeshStandardMaterial({ color: route.color, emissive: route.color, emissiveIntensity: 0.18, roughness: 0.6 }),
    );
    band.userData = { kind: 'route', id: route.id, baseColor: route.color };
    band.castShadow = !elevated;
    if (!elevated) {
      // A busway: a low slab under the paint that also carries the line over water.
      const way = new THREE.Mesh(sweep(curve, rectProfile(5.4, -2.4, 0), 0.46, 0, curve.length, 3), deckMat);
      way.receiveShadow = true;
      way.userData = { kind: 'deck' };
      byMode[route.mode].add(way);
    }
    byMode[route.mode].add(band);
    pickables.push(band);
    routeMeshById.set(route.id, band);

    if (elevated) {
      const m = route.mode as 'metro' | 'rail';
      const w = DECK_W[m];
      // Kerbs: two thin walls along the deck edges.
      const kerbL = sweep(curve, [[w / 2 - 0.42, 0], [w / 2, 0], [w / 2, 0.8], [w / 2 - 0.42, 0.8]], y0, 0, curve.length, 3);
      const kerbR = sweep(curve, [[-w / 2, 0], [-w / 2 + 0.42, 0], [-w / 2 + 0.42, 0.8], [-w / 2, 0.8]], y0, 0, curve.length, 3);
      const deckMesh = new THREE.Mesh(
        merge([sweep(curve, rectProfile(w, -DECK_T, 0), y0, 0, curve.length, 3), kerbL, kerbR]),
        deckMat,
      );
      deckMesh.castShadow = true;
      deckMesh.receiveShadow = true;
      deckMesh.userData = { kind: 'deck' };
      byMode[route.mode].add(deckMesh);

      // Piers every ~26 m, clear of the stations (which carry their own columns).
      const deckBottom = y0 - DECK_T;
      for (let s = 24; s < curve.length - 20; s += 26) {
        if (curve.knots.some((k) => Math.abs(k - s) < 24)) continue;
        const p = curve.pointAtArc(s);
        const t = curve.tangentAtArc(s);
        const yaw = Math.atan2(t.x, t.z);
        const h = deckBottom - 0.4;
        const col = new THREE.BoxGeometry(1.9, h + 3.55, 1.9);
        col.rotateY(yaw);
        col.translate(p.x, -3 + (h + 3.55) / 2, p.z);
        const cap = new THREE.BoxGeometry(w * 0.82, 0.8, 1.9);
        cap.rotateY(yaw);
        cap.translate(p.x, deckBottom - 0.4, p.z);
        piers[m].push(col.toNonIndexed(), cap.toNonIndexed());
      }
    }

    const r = elevated ? 9 : 5;
    for (let s = 0; s <= curve.length; s += 7) {
      const p = curve.pointAtArc(s);
      avoid.push({ x: p.x, z: p.z, r });
    }
  }

  for (const m of ['metro', 'rail'] as const) {
    if (piers[m].length === 0) continue;
    const mesh = new THREE.Mesh(merge(piers[m]), pierMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { kind: 'pier' };
    byMode[m].add(mesh);
  }

  const stationMeshById = new Map<string, THREE.Mesh>();
  const plazas: THREE.BufferGeometry[] = [];
  for (const st of stations) {
    const interchange = st.routeIds.length > 1;
    const levels: LevelInfo[] = [];
    for (const mode of ['rail', 'metro', 'bus'] as const) {
      const rid = st.routeIds.find((id) => routes.find((r) => r.id === id)?.mode === mode);
      if (!rid) continue;
      const route = routes.find((r) => r.id === rid);
      const curve = curves.get(rid);
      const idx = route ? route.stationIds.indexOf(st.id) : -1;
      const h = curve && idx >= 0 ? curve.headings[idx] : undefined;
      levels.push({ mode, yaw: h ? Math.atan2(h.x, h.z) : 0 });
    }
    if (levels.length === 0) levels.push({ mode: 'bus', yaw: 0 });
    const topMode = levels[0].mode;
    const yTop = MODE_Y[topMode];
    const mesh = new THREE.Mesh(
      stationGeometry(levels, yTop),
      new THREE.MeshStandardMaterial({
        color: interchange ? STATION.interchange : STATION.regular,
        emissive: STATION.glow,
        emissiveIntensity: 0.1,
        vertexColors: true,
        roughness: 0.8,
      }),
    );
    mesh.position.set(st.pos.x, yTop, st.pos.z);
    if (interchange || levels.length > 1) {
      // Forecourt where lines meet: pale paving, not part of the station's own tint.
      const plaza = new THREE.CylinderGeometry(15, 15, 0.16, 28);
      plaza.translate(st.pos.x, 0.5, st.pos.z);
      plazas.push(plaza.toNonIndexed());
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { kind: 'station', id: st.id };
    group.add(mesh);
    pickables.push(mesh);
    stationMeshById.set(st.id, mesh);
    avoid.push({ x: st.pos.x, z: st.pos.z, r: interchange ? 24 : 18 });
  }

  if (plazas.length) {
    const plaza = new THREE.Mesh(merge(plazas), new THREE.MeshStandardMaterial({ color: TRACK.platform, roughness: 1 }));
    plaza.receiveShadow = true;
    group.add(plaza);
  }
  group.add(byMode.metro, byMode.rail, byMode.bus);
  return { group, byMode, pickables, stationMeshById, routeMeshById, curves, avoid };
}
