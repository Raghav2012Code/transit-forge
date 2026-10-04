import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SimulationState } from '../simulation/index.ts';
import type { CongestionLevel } from '../types/index.ts';
import { buildCityMeshes } from './city/buildCity.ts';
import { buildNetworkMeshes } from './transport/buildNetwork.ts';
import { buildVehicles, syncVehicleMeshes, updateVehicles } from './vehicles/vehicles.ts';
import { buildCarRig, updateCarRig } from './traffic/carRig.ts';

export interface Layers {
  metro: boolean;
  rail: boolean;
  bus: boolean;
  roads: boolean;
  buildings: boolean;
}

export interface Selection {
  kind: 'station' | 'route' | 'zone' | 'road';
  id: string;
}

export type Overlay =
  | 'normal' | 'flow' | 'load' | 'congestion'
  | 'accessibility' | 'traveltime' | 'coverage' | 'bottlenecks'
  | 'frequency' | 'crowding'
  | 'popdensity' | 'jobdensity' | 'development' | 'growth' | 'demand'
  | 'status' | 'critical';

export type AccessGradeKey = 'excellent' | 'good' | 'moderate' | 'poor' | 'very poor';

/** Analytics values for heatmap overlays (computed by the sim analytics layer). */
export interface AnalyticsView {
  grades: Record<string, AccessGradeKey>;
  /** Travel minutes per zone to the selected destination (null = unreachable). */
  travel: Record<string, number | null>;
  travelMax: number;
  /** Covered population share per zone (0-100). */
  coverage: Record<string, number>;
  /** Station ids to pulse in bottleneck mode. */
  bottleneckStations: string[];
  /** Growth/density layers (raw per-zone values + maxima). */
  popD: Record<string, number>;
  popMax: number;
  jobD: Record<string, number>;
  jobMax: number;
  dev: Record<string, number>;
  growth: Record<string, number>;
  growthMax: number;
  demand: Record<string, number>;
  demandMax: number;
  /** Structural criticality score per station/route/road id (0-100). */
  criticalScores: Record<string, number>;
}

export interface BuildInteractions {
  /** Which pickable kinds the active tool accepts; empty = map clicks only. */
  pickKinds: Selection['kind'][];
  onPick: (sel: Selection) => void;
  onMapClick: (x: number, z: number) => void;
  onHover: (x: number, z: number) => void;
}

export interface DraftPoint {
  x: number;
  z: number;
}

export interface DraftView {
  points: DraftPoint[];
  hover: DraftPoint | null;
  hoverValid: boolean;
}

interface SceneViewProps {
  simRef: React.RefObject<SimulationState>;
  layers: Layers;
  overlay: Overlay;
  selection: Selection | null;
  onSelect: (sel: Selection | null) => void;
  /** Increment to rebuild network/road/vehicle objects after scenario edits. */
  networkKey: number;
  /** Positions of deleted stations shown as red ghosts. */
  ghosts: DraftPoint[];
  /** New route ids to pulse-highlight in scenario view. */
  highlightRoutes: string[];
  /** Active build tool interactions; null in simulate mode. */
  build: BuildInteractions | null;
  /** Draft route/road preview; null when no draft. */
  draft: DraftView | null;
  /** Analytics heatmap values; null when no analytics overlay active. */
  analytics: AnalyticsView | null;
}

function stationLoad(waiting: number, capacityPerHr: number): number {
  return Math.min(1, waiting / Math.max(1, capacityPerHr * 0.25));
}

const CONGESTION_COLORS: Record<CongestionLevel, number> = {
  free: 0x34d399,
  light: 0xfacc15,
  moderate: 0xfb923c,
  heavy: 0xef4444,
  severe: 0x991b1b,
};

const GRADE_COLORS: Record<AccessGradeKey, number> = {
  excellent: 0x34d399,
  good: 0xa3e635,
  moderate: 0xfacc15,
  poor: 0xfb923c,
  'very poor': 0xef4444,
};

// Rendering consumes simulation data; it never mutates it or holds sim logic.
export default function SceneView({ simRef, layers, overlay, selection, onSelect, networkKey, ghosts, highlightRoutes, build, draft, analytics }: SceneViewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const layersRef = useRef(layers);
  const overlayRef = useRef(overlay);
  const buildRef = useRef(build);
  const draftRef = useRef(draft);
  const ghostsRef = useRef(ghosts);
  const highlightRef = useRef(highlightRoutes);
  const analyticsRef = useRef(analytics);
  // Mirror latest props for the RAF loop and event handlers (committed values
  // only; the render path itself never touches refs).
  useEffect(() => {
    onSelectRef.current = onSelect;
    layersRef.current = layers;
    overlayRef.current = overlay;
    buildRef.current = build;
    draftRef.current = draft;
    ghostsRef.current = ghosts;
    highlightRef.current = highlightRoutes;
    selectionRef.current = selection;
    analyticsRef.current = analytics;
  });
  const rigRef = useRef<{
    stationMeshById: Map<string, THREE.Mesh>;
    pickables: THREE.Object3D[];
    groups: { metro: THREE.Group; rail: THREE.Group; bus: THREE.Group; roads: THREE.Group; buildings: THREE.Group };
  } | null>(null);
  const selectionRef = useRef<Selection | null>(selection);
  // (mirrored in the commit effect below alongside the other live refs)

  useEffect(() => {
    const mount = mountRef.current;
    const sim = simRef.current;
    if (!mount || !sim) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1020);
    scene.fog = new THREE.Fog(0x0b1020, 700, 1600);

    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.5, 4000);
    camera.position.set(330, 290, 330);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(40, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 60;
    controls.maxDistance = 1000;
    controls.maxPolarAngle = Math.PI * 0.47;

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(200, 320, 120);
    scene.add(sun);

    const city = buildCityMeshes(sim.city);
    scene.add(city.group);
    const net = buildNetworkMeshes(sim.stations, sim.routes);
    scene.add(net.group);
    const rig = buildVehicles(sim.vehicles, sim.routes, sim.stations);
    scene.add(rig.group);
    const carRig = buildCarRig(sim.city);
    city.roads.add(carRig.group);
    const edgeLen = new Map(sim.city.roadEdges.map((e) => [e.id, e.lengthM]));
    const pickables = [...net.pickables];
    // Zone discs for district picking.
    city.group.children.forEach((c) => {
      if (c.userData?.kind === 'zone') pickables.push(c);
    });
    // Road segments for inspection.
    for (const [, mesh] of city.roadMeshById) pickables.push(mesh);
    rigRef.current = {
      stationMeshById: net.stationMeshById,
      pickables,
      groups: { metro: net.byMode.metro, rail: net.byMode.rail, bus: net.byMode.bus, roads: city.roads, buildings: city.buildings },
    };

    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const groundHit = new THREE.Vector3();
    const pickAt = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ptr.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ptr.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(ptr, camera);
      return rect;
    };
    const handleClick = (e: MouseEvent) => {
      const b = buildRef.current;
      pickAt(e);
      if (b) {
        // Build mode: station/route tools use pickables, map tools use ground.
        if (b.pickKinds.length > 0) {
          ray.params.Line = { threshold: 4 };
          const hits = ray.intersectObjects(pickables, false);
          for (const h of hits) {
            const ud = h.object.userData as { kind: Selection['kind']; id: string };
            if (b.pickKinds.includes(ud.kind)) {
              b.onPick({ kind: ud.kind, id: ud.id });
              return;
            }
          }
          return; // clicked nothing valid for this tool
        }
        if (ray.ray.intersectPlane(groundPlane, groundHit)) {
          b.onMapClick(groundHit.x, groundHit.z);
        }
        return;
      }
      ray.params.Line = { threshold: 4 };
      const hits = ray.intersectObjects(pickables, false);
      if (hits.length === 0) {
        onSelectRef.current(null);
        return;
      }
      const ud = hits[0].object.userData as { kind: Selection['kind']; id: string };
      onSelectRef.current({ kind: ud.kind, id: ud.id });
    };
    const handleHover = (e: MouseEvent) => {
      const b = buildRef.current;
      if (!b) return;
      pickAt(e);
      if (ray.ray.intersectPlane(groundPlane, groundHit)) {
        b.onHover(groundHit.x, groundHit.z);
      }
    };
    renderer.domElement.addEventListener('click', handleClick);
    renderer.domElement.addEventListener('mousemove', handleHover);

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    const selRing = new THREE.Mesh(
      new THREE.TorusGeometry(7, 0.8, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
    );
    selRing.rotation.x = -Math.PI / 2;
    selRing.visible = false;
    scene.add(selRing);

    // Deleted-station ghosts (scenario diff).
    const ghostGroup = new THREE.Group();
    ghostGroup.name = 'ghosts';
    for (const g of ghostsRef.current) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(6, 0.9, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xef4444, wireframe: true }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(g.x, 6, g.z);
      ghostGroup.add(ring);
    }
    scene.add(ghostGroup);

    // Incident markers: rebuilt when the active incident set changes.
    const incidentGroup = new THREE.Group();
    incidentGroup.name = 'incidents';
    scene.add(incidentGroup);
    let lastIncidentSig = '';
    const markerMat = (color: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const rebuildIncidentMarkers = (sig: string) => {
      if (sig === lastIncidentSig) return;
      lastIncidentSig = sig;
      incidentGroup.clear();
      const sim = simRef.current;
      if (!sim) return;
      for (const inc of sim.incidents) {
        if (inc.status !== 'active') continue;
        const spots: THREE.Vector3[] = [];
        if (inc.targetStationId) {
          const m = net.stationMeshById.get(inc.targetStationId);
          if (m) spots.push(m.position.clone().setY(10));
        }
        for (const e of inc.edgeIds ?? []) {
          const m = city.roadMeshById.get(e);
          if (m) spots.push(m.position.clone().setY(6));
        }
        if (inc.targetRouteId && !inc.targetStationId && (inc.edgeIds ?? []).length === 0) {
          const r = sim.routes.find((x) => x.id === inc.targetRouteId);
          const mid = r?.stationIds[Math.floor(r.stationIds.length / 2)];
          const m = mid ? net.stationMeshById.get(mid) : undefined;
          if (m) spots.push(m.position.clone().setY(12));
        }
        for (const p of spots) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 1, 8, 32), markerMat(0xef4444));
          ring.rotation.x = -Math.PI / 2;
          ring.position.copy(p);
          ring.userData.incidentMarker = true;
          incidentGroup.add(ring);
        }
        // Replacement shuttle line between its endpoint stations.
        if (inc.replacementRouteId) {
          const rep = inc.replacement;
          const a = rep ? net.stationMeshById.get(rep.fromStationId) : undefined;
          const b = rep ? net.stationMeshById.get(rep.toStationId) : undefined;
          if (a && b) {
            const line = new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([
                a.position.clone().setY(9),
                b.position.clone().setY(9),
              ]),
              new THREE.LineBasicMaterial({ color: 0xf472b6 }),
            );
            incidentGroup.add(line);
          }
        }
      }
    };

    // Draft preview: route/road path + hover marker, rebuilt when draft changes.
    const draftGroup = new THREE.Group();
    draftGroup.name = 'draft';
    scene.add(draftGroup);
    let lastDraftKey = '';
    const draftMat = new THREE.LineBasicMaterial({ color: 0xfacc15 });
    const draftDotGeo = new THREE.SphereGeometry(2.2, 12, 12);
    const draftDotMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const hoverDotMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.8 });
    const rebuildDraft = () => {
      const d = draftRef.current;
      const key = d ? JSON.stringify(d) : '';
      if (key === lastDraftKey) return;
      lastDraftKey = key;
      draftGroup.clear();
      if (!d) return;
      const y = 9;
      const pts = d.points.map((p) => new THREE.Vector3(p.x, y, p.z));
      if (d.hover) pts.push(new THREE.Vector3(d.hover.x, y, d.hover.z));
      if (pts.length >= 2) {
        draftGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), draftMat));
      }
      for (const p of d.points) {
        const dot = new THREE.Mesh(draftDotGeo, draftDotMat);
        dot.position.set(p.x, y, p.z);
        draftGroup.add(dot);
      }
      if (d.hover) {
        hoverDotMat.color.setHex(d.hoverValid ? 0x4ade80 : 0xef4444);
        const hov = new THREE.Mesh(draftDotGeo, hoverDotMat);
        hov.position.set(d.hover.x, y, d.hover.z);
        draftGroup.add(hov);
      }
    };

    const loadColor = new THREE.Color();
    const baseColor = new THREE.Color(0xcbd5e1);
    const hotColor = new THREE.Color(0xef4444);
    const routeBase = new THREE.Color();
    const routeHot = new THREE.Color(0xffffff);
    let raf = 0;
    let elapsed = 0;
    let lastFrame = performance.now();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      elapsed += Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      const cur = simRef.current;
      if (cur) {
        syncVehicleMeshes(rig, cur.vehicles, cur.routes);
        updateVehicles(rig, cur.vehicles);
        updateCarRig(carRig, cur.cars, edgeLen);
        rebuildDraft();
        const ov = overlayRef.current;
        const highlighted = new Set(highlightRef.current);
        const av = analyticsRef.current;
        // Road congestion colors from live volume/capacity (congestion overlay).
        for (const [id, mesh] of city.roadMeshById) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (ov === 'congestion') {
            const level = cur.edgeState[id]?.level ?? 'free';
            mat.color.setHex(CONGESTION_COLORS[level]);
            mat.emissive.setHex(CONGESTION_COLORS[level]);
            mat.emissiveIntensity = 0.45;
          } else if (ov === 'status') {
            const st = cur.edgeState[id];
            if (st?.closed) {
              mat.color.setHex(0xef4444);
              mat.emissive.setHex(0xef4444);
              mat.emissiveIntensity = 0.8 + 0.4 * Math.sin(elapsed * 5);
            } else if (st && st.capMult < 1) {
              mat.color.setHex(0xfb923c);
              mat.emissive.setHex(0xfb923c);
              mat.emissiveIntensity = 0.5;
            } else {
              mat.color.setHex(mesh.userData.baseColor as number);
              mat.emissive.setHex(mesh.userData.baseColor as number);
              mat.emissiveIntensity = 0;
            }
          } else if (ov === 'critical' && av) {
            const score = av.criticalScores[id] ?? 0;
            if (score > 0) {
              loadColor.setHex(0x1e3a8a).lerp(hotColor, Math.min(1, score / 100));
              mat.color.copy(loadColor);
              mat.emissive.copy(loadColor);
              mat.emissiveIntensity = 0.5;
            } else {
              mat.color.setHex(mesh.userData.baseColor as number);
              mat.emissive.setHex(mesh.userData.baseColor as number);
              mat.emissiveIntensity = 0;
            }
          } else {
            mat.color.setHex(mesh.userData.baseColor as number);
            mat.emissive.setHex(mesh.userData.baseColor as number);
            mat.emissiveIntensity = 0;
          }
        }
        // Route usage from actual boardings (flow overlay input).
        const usage = cur.counters.routeBoardings;
        let maxUse = 1;
        for (const id in usage) maxUse = Math.max(maxUse, usage[id]);
        // Live occupancy per route for the crowding view.
        const occSum: Record<string, number> = {};
        const occN: Record<string, number> = {};
        for (const vv of cur.vehicles) {
          occSum[vv.routeId] = (occSum[vv.routeId] ?? 0) + vv.load / Math.max(1, vv.capacity);
          occN[vv.routeId] = (occN[vv.routeId] ?? 0) + 1;
        }
        for (const [id, mesh] of net.routeMeshById) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          const u = Math.min(1, (usage[id] ?? 0) / maxUse);
          if (highlighted.has(id)) {
            // Scenario additions pulse so differences are obvious.
            routeBase.set(mesh.userData.baseColor as string);
            mat.color.copy(routeBase).lerp(routeHot, 0.35 + 0.3 * Math.sin(elapsed * 4));
            mat.emissive.copy(routeBase);
            mat.emissiveIntensity = 1.6 + 0.8 * Math.sin(elapsed * 4);
          } else if (ov === 'flow') {
            routeBase.set(mesh.userData.baseColor as string);
            mat.color.copy(routeBase).lerp(routeHot, u * 0.45);
            mat.emissive.copy(routeBase);
            mat.emissiveIntensity = 0.15 + 2.4 * u;
          } else if (ov === 'frequency') {
            // Scheduled peak headway: intense = frequent service.
            const h = cur.service[id]?.peakHeadwayMin ?? 15;
            const f = Math.min(1, Math.max(0, 1 - (h - 3) / 27));
            routeBase.set(mesh.userData.baseColor as string);
            mat.color.copy(routeBase).lerp(routeHot, f * 0.3);
            mat.emissive.copy(routeBase);
            mat.emissiveIntensity = 0.15 + 2.2 * f;
          } else if (ov === 'crowding') {            // Live occupancy: frequent-but-empty looks different from packed.
            const occ = occN[id] ? occSum[id] / occN[id] : 0;
            routeBase.set(mesh.userData.baseColor as string);
            if (occ >= 0.9) {
              mat.color.setHex(0xef4444);
              mat.emissive.setHex(0xef4444);
              mat.emissiveIntensity = 1.4 + 0.8 * Math.sin(elapsed * 5);
            } else if (occ >= 0.7) {
              mat.color.copy(routeBase).lerp(routeHot, 0.35);
              mat.emissive.setHex(0xfb923c);
              mat.emissiveIntensity = 1.1;
            } else {
              mat.color.copy(routeBase);
              mat.emissive.copy(routeBase);
              mat.emissiveIntensity = 0.25;
            }
          } else if (ov === 'status') {
            // Network status: suspended red, reduced amber, else base.
            const suspended = cur.closures.suspendedRoutes.has(id);
            const reduced = (cur.closures.headwayMult.get(id) ?? 1) > 1;
            if (suspended) {
              mat.color.setHex(0xef4444);
              mat.emissive.setHex(0xef4444);
              mat.emissiveIntensity = 1.2 + 0.6 * Math.sin(elapsed * 5);
            } else if (reduced) {
              routeBase.set(mesh.userData.baseColor as string);
              mat.color.copy(routeBase).lerp(routeHot, 0.3);
              mat.emissive.setHex(0xfb923c);
              mat.emissiveIntensity = 0.9;
            } else {
              routeBase.set(mesh.userData.baseColor as string);
              mat.color.copy(routeBase);
              mat.emissive.copy(routeBase);
              mat.emissiveIntensity = 0.35;
            }
          } else if (ov === 'critical' && av) {
            const score = av.criticalScores[id] ?? 0;
            if (score > 0) {
              loadColor.setHex(0x1e3a8a).lerp(hotColor, Math.min(1, score / 100));
              mat.color.copy(loadColor);
              mat.emissive.copy(loadColor);
              mat.emissiveIntensity = 0.6;
            } else {
              routeBase.set(mesh.userData.baseColor as string);
              mat.color.copy(routeBase);
              mat.emissive.copy(routeBase);
              mat.emissiveIntensity = 0.1;
            }
          } else {
            routeBase.set(mesh.userData.baseColor as string);
            mat.color.copy(routeBase);
            mat.emissive.copy(routeBase);
            mat.emissiveIntensity = ov === 'load' ? 0.12 : 0.35;
          }
        }
        // Analytics heatmaps on zone discs (values from the analytics layer).
        const heat = ov === 'accessibility' || ov === 'traveltime' || ov === 'coverage' ||
          ov === 'popdensity' || ov === 'jobdensity' || ov === 'development' || ov === 'growth' || ov === 'demand';
        for (const [id, disc] of city.zoneDiscById) {
          const mat = disc.material as THREE.MeshBasicMaterial;
          if (heat && av) {
            mat.opacity = 0.42;
            if (ov === 'accessibility') {
              mat.color.setHex(GRADE_COLORS[av.grades[id] ?? 'poor']);
            } else if (ov === 'traveltime') {
              const t = av.travel[id];
              if (t === null || t === undefined) mat.color.setHex(0x475569);
              else {
                const f = Math.min(1, t / Math.max(1, av.travelMax));
                loadColor.setHex(0x34d399).lerp(hotColor, f);
                mat.color.copy(loadColor);
              }
            } else if (ov === 'coverage') {
              const f = Math.min(1, Math.max(0, (av.coverage[id] ?? 0) / 100));
              loadColor.setHex(0x1e3a8a).lerp(routeHot, f * 0.85);
              mat.color.copy(loadColor);
            } else if (ov === 'popdensity' || ov === 'jobdensity') {
              const max = ov === 'popdensity' ? av.popMax : av.jobMax;
              const v = ov === 'popdensity' ? (av.popD[id] ?? 0) : (av.jobD[id] ?? 0);
              const f = max > 0 ? Math.min(1, v / max) : 0;
              loadColor.setHex(0x1e3a8a).lerp(routeHot, 0.15 + f * 0.85);
              mat.color.copy(loadColor);
            } else if (ov === 'development') {
              const d = av.dev[id] ?? 0;
              mat.color.setHex(
                d >= 0.85 ? 0xef4444 : d >= 0.65 ? 0xfb923c : d >= 0.4 ? 0xfacc15 : d >= 0.15 ? 0x34d399 : 0x475569,
              );
            } else if (ov === 'growth') {
              const f = av.growthMax > 0 ? Math.min(1, Math.max(0, (av.growth[id] ?? 0) / av.growthMax)) : 0;
              loadColor.setHex(0x14532d).lerp(routeHot, 0.2 + f * 0.8);
              mat.color.copy(loadColor);
            } else {
              // demand
              const f = av.demandMax > 0 ? Math.min(1, (av.demand[id] ?? 0) / av.demandMax) : 0;
              loadColor.setHex(0x34d399).lerp(hotColor, f);
              mat.color.copy(loadColor);
            }
          } else {
            mat.opacity = 0.05;
            mat.color.setHex(0x6ea8fe);
          }
        }
        // Bottleneck pulse on flagged stations.
        const bottleneckSet = ov === 'bottlenecks' && av ? new Set(av.bottleneckStations) : null;
        const byId = new Map(cur.stations.map((s) => [s.id, s]));
        for (const [id, mesh] of net.stationMeshById) {
          const st = byId.get(id);
          if (!st) continue;
          const load = stationLoad(st.waiting, st.capacityPerHr);
          const mat = mesh.material as THREE.MeshStandardMaterial;
          const boosted = ov === 'load' ? Math.pow(load, 0.6) : load;
          loadColor.copy(baseColor).lerp(hotColor, boosted);
          mat.color.copy(loadColor);
          mat.emissiveIntensity = ov === 'load' ? 0.3 + 1.8 * load : 0.4;
          let sc = ov === 'load' ? 1 + load * 0.6 : 1;
          if (bottleneckSet?.has(id)) {
            mat.emissive.setHex(0xef4444);
            mat.emissiveIntensity = 1.2 + 0.8 * Math.sin(elapsed * 5);
            sc = Math.max(sc, 1.35);
          }
          if (ov === 'status' && cur.closures.closedStations.has(id)) {
            mat.color.setHex(0xef4444);
            mat.emissive.setHex(0xef4444);
            mat.emissiveIntensity = 1.2 + 0.6 * Math.sin(elapsed * 5);
            sc = Math.max(sc, 1.3);
          }
          if (ov === 'critical' && av) {
            const score = av.criticalScores[id] ?? 0;
            if (score > 0) {
              loadColor.setHex(0x1e3a8a).lerp(hotColor, Math.min(1, score / 100));
              mat.color.copy(loadColor);
              mat.emissive.copy(loadColor);
              mat.emissiveIntensity = 0.3 + Math.min(1, score / 100);
              sc = Math.max(sc, 1 + Math.min(1, score / 100) * 0.4);
            }
          }
          mesh.scale.set(sc, 1, sc);
        }
        // Incident markers follow the active incident set.
        rebuildIncidentMarkers(cur.closureSig);
        const sel = selectionRef.current;
        if (sel && (sel.kind === 'station' || sel.kind === 'zone')) {
          const st = byId.get(sel.id);
          const zone = cur.city.zones.find((z) => z.id === sel.id);
          const p = st?.pos ?? zone?.center;
          if (p) {
            selRing.visible = true;
            selRing.position.set(p.x, 9, p.z);
          } else selRing.visible = false;
        } else if (sel && sel.kind === 'road') {
          const edge = cur.city.roadEdges.find((e) => e.id === sel.id);
          const nodeById = new Map(cur.city.roadNodes.map((n) => [n.id, n.pos]));
          const a = edge ? nodeById.get(edge.a) : undefined;
          const b = edge ? nodeById.get(edge.b) : undefined;
          if (a && b) {
            selRing.visible = true;
            selRing.position.set((a.x + b.x) / 2, 6, (a.z + b.z) / 2);
          } else selRing.visible = false;
        } else selRing.visible = false;
        const L = layersRef.current;
        net.byMode.metro.visible = L.metro;
        net.byMode.rail.visible = L.rail;
        net.byMode.bus.visible = L.bus;
        city.roads.visible = L.roads;
        city.buildings.visible = L.buildings;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('click', handleClick);
      renderer.domElement.removeEventListener('mousemove', handleHover);
      controls.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      rigRef.current = null;
    };
    // Full scene rebuild only on discrete scenario applies (networkKey).
    // Live data flows via simRef, which is stable for the app lifetime.
  }, [networkKey, simRef]);

  return <div ref={mountRef} className="scene-mount" aria-label="TransitForge 3D viewport" />;
}
