import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SimulationState } from '../simulation/index.ts';
import type { CongestionLevel } from '../types/index.ts';
import { buildCityMeshes } from './city/buildCity.ts';
import { buildNetworkMeshes } from './transport/buildNetwork.ts';
import { buildVehicles, syncVehicleMeshes, updateVehicles } from './vehicles/vehicles.ts';
import { buildCarRig, updateCarRig } from './traffic/carRig.ts';
import type { CameraCmd } from './map/camera.ts';
import { resolveClick, type CycleCandidate, type CycleState } from './map/selectionCycle.ts';
import type { MapMarker } from './map/markers.ts';
import { getPalette, type Theme } from './palette.ts';

export interface Layers {
  metro: boolean;
  rail: boolean;
  bus: boolean;
  roads: boolean;
  buildings: boolean;
  labels: boolean;
  vehicles: boolean;
  problems: boolean;
}

export interface Selection {
  kind: 'station' | 'route' | 'zone' | 'road' | 'vehicle' | 'incident' | 'problem';
  id: string;
}

/** Reported camera state (throttled) for the minimap + nav widget. */
export interface CameraInfo {
  pos: [number, number, number];
  target: [number, number, number];
  dist: number;
}

/** Hover payload for the map tooltip (assembled in the event handler). */
export interface HoverInfo {
  kind: Selection['kind'];
  id: string;
  name: string;
  type: string;
  metric: string;
  x: number;
  y: number;
}

export interface CatchmentView {
  x: number;
  z: number;
  radii: number[];
}

export interface MeasureView {
  /** Fixed first point; null while the tool waits for it. */
  a: { x: number; z: number } | null;
  /** Fixed second point; null while placing. */
  b: { x: number; z: number } | null;
  hover: { x: number; z: number } | null;
  label: string;
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
  /** Colours the whole scene; changing it rebuilds the scene and keeps the camera. */
  theme: Theme;
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
  /** Camera command; applied once per sequence id (presets, focus, minimap). */
  cameraCmd: CameraCmd | null;
  /** Throttled camera reports for minimap / nav widget. */
  onCamera: ((info: CameraInfo) => void) | null;
  /** Throttled hover picks for the map tooltip (simulate mode). */
  onHoverObject: ((h: HoverInfo | null) => void) | null;
  /** Right-click pick for the context menu. */
  onContextPick: ((sel: Selection, x: number, y: number) => void) | null;
  /** Clickable planning-problem markers (plan mode). */
  problemMarkers: MapMarker[];
  /** What-changed indicators derived from the op log. */
  changeMarkers: MapMarker[];
  /** Walking catchment rings around the inspected station; null hides. */
  catchment: CatchmentView | null;
  /** Measurement line; null hides. */
  measure: MeasureView | null;
  /** When true, map clicks feed the measurement tool instead of selecting. */
  measureActive: boolean;
  onMeasurePoint: ((x: number, z: number) => void) | null;
  onMeasureHover: ((x: number, z: number) => void) | null;
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
export default function SceneView({ simRef, layers, overlay, selection, onSelect, networkKey, theme, ghosts, highlightRoutes, build, draft, analytics, cameraCmd, onCamera, onHoverObject, onContextPick, problemMarkers, changeMarkers, catchment, measure, measureActive, onMeasurePoint, onMeasureHover }: SceneViewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  // A theme change rebuilds the scene; the camera pose rides across so the
  // view does not jump. (A network change keeps its existing fresh start.)
  const poseRef = useRef<{ pos: number[]; target: number[] } | null>(null);
  const lastThemeRef = useRef(theme);
  const onSelectRef = useRef(onSelect);
  const layersRef = useRef(layers);
  const overlayRef = useRef(overlay);
  const buildRef = useRef(build);
  const draftRef = useRef(draft);
  const ghostsRef = useRef(ghosts);
  const highlightRef = useRef(highlightRoutes);
  const analyticsRef = useRef(analytics);
  const cameraCmdRef = useRef(cameraCmd);
  const onCameraRef = useRef(onCamera);
  const onHoverRef = useRef(onHoverObject);
  const onContextRef = useRef(onContextPick);
  const problemMarkersRef = useRef(problemMarkers);
  const changeMarkersRef = useRef(changeMarkers);
  const catchmentRef = useRef(catchment);
  const measureRef = useRef(measure);
  const measureActiveRef = useRef(measureActive);
  const onMeasurePointRef = useRef(onMeasurePoint);
  const onMeasureHoverRef = useRef(onMeasureHover);
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
    cameraCmdRef.current = cameraCmd;
    onCameraRef.current = onCamera;
    onHoverRef.current = onHoverObject;
    onContextRef.current = onContextPick;
    problemMarkersRef.current = problemMarkers;
    changeMarkersRef.current = changeMarkers;
    catchmentRef.current = catchment;
    measureRef.current = measure;
    measureActiveRef.current = measureActive;
    onMeasurePointRef.current = onMeasurePoint;
    onMeasureHoverRef.current = onMeasureHover;
    mountRef.current?.classList.toggle('tf-measuring', measureActive);
    problemLabelById.current = new Map(problemMarkers.map((m) => [m.selId, m.label]));
  });
  const rigRef = useRef<{
    stationMeshById: Map<string, THREE.Mesh>;
    pickables: THREE.Object3D[];
    groups: { metro: THREE.Group; rail: THREE.Group; bus: THREE.Group; roads: THREE.Group; buildings: THREE.Group };
  } | null>(null);
  const selectionRef = useRef<Selection | null>(selection);
  // (mirrored in the commit effect below alongside the other live refs)
  const problemLabelById = useRef(new Map<string, string>());

  useEffect(() => {
    const mount = mountRef.current;
    const sim = simRef.current;
    if (!mount || !sim) return;

    const P = getPalette(theme);
    const { scene: SCENE, station: STATION, mark: MARK, ramp: RAMP } = P;
    const light = theme === 'light';
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const dpr = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);
    // Canvas-texture label billboards (map labels, measure tool) are drawn
    // at a fixed logical size but must rasterize at this same device-pixel
    // density, or every one is half-resolution on a HiDPI display and reads
    // as a blurry, illegible smudge.
    const labelDpr = dpr;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SCENE.background);
    scene.fog = new THREE.Fog(SCENE.background, P.lighting.fogNear, P.lighting.fogFar);

    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.5, 4000);
    camera.position.set(330, 290, 330);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(40, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 60;
    controls.maxDistance = 1000;
    controls.maxPolarAngle = Math.PI * 0.47;
    if (lastThemeRef.current !== theme && poseRef.current) {
      camera.position.fromArray(poseRef.current.pos);
      controls.target.fromArray(poseRef.current.target);
    }
    lastThemeRef.current = theme;

    scene.add(new THREE.AmbientLight(0xffffff, P.lighting.ambient));
    const sun = new THREE.DirectionalLight(0xffffff, P.lighting.sun);
    sun.position.set(200, 320, 120);
    scene.add(sun);

    const city = buildCityMeshes(sim.city, P);
    scene.add(city.group);
    const net = buildNetworkMeshes(sim.stations, sim.routes, P);
    scene.add(net.group);
    const rig = buildVehicles(sim.vehicles, sim.routes, sim.stations);
    scene.add(rig.group);
    const carRig = buildCarRig(sim.city, P);
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
    // Full pick set for inspection: static pickables plus live vehicle meshes
    // plus incident / problem / change markers (registered below).
    const extraPickables: THREE.Object3D[] = [];
    const KIND_PRIORITY: Record<string, number> = {
      station: 0, vehicle: 1, incident: 2, problem: 3, route: 4, road: 5, zone: 6,
    };
    const collectCandidates = (hits: THREE.Intersection[]): CycleCandidate[] => {
      const seen = new Map<string, CycleCandidate>();
      for (const h of hits) {
        const ud = h.object.userData as { kind?: Selection['kind']; id?: string };
        if (!ud.kind || ud.id === undefined) continue;
        const key = `${ud.kind}:${ud.id}`;
        if (!seen.has(key)) seen.set(key, { kind: ud.kind, id: ud.id });
      }
      return [...seen.values()].sort(
        (a, b) => (KIND_PRIORITY[a.kind] ?? 9) - (KIND_PRIORITY[b.kind] ?? 9),
      );
    };
    let cycleState: CycleState | null = null;
    const pickAll = (): THREE.Object3D[] => [...pickables, ...extraPickables];
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
      if (measureActiveRef.current) {
        if (ray.ray.intersectPlane(groundPlane, groundHit)) {
          onMeasurePointRef.current?.(groundHit.x, groundHit.z);
        }
        return;
      }
      ray.params.Line = { threshold: 4 };
      const hits = ray.intersectObjects(pickAll(), false);
      const candidates = collectCandidates(hits);
      // Repeated clicks on the same spot cycle stacked objects (§10).
      const { pick, state } = resolveClick(cycleState, e.clientX, e.clientY, performance.now(), candidates);
      cycleState = state;
      onSelectRef.current(pick ? { kind: pick.kind as Selection['kind'], id: pick.id } : null);
    };
    const hoverInfoFor = (kind: Selection['kind'], id: string, x: number, y: number): HoverInfo | null => {
      const sim = simRef.current;
      if (!sim) return null;
      if (kind === 'station') {
        const st = sim.stations.find((s) => s.id === id);
        if (!st) return null;
        return { kind, id, name: st.name, type: st.routeIds.length > 1 ? 'Interchange station' : 'Station', metric: `${Math.round(st.waiting)} waiting`, x, y };
      }
      if (kind === 'route') {
        const r = sim.routes.find((x) => x.id === id);
        if (!r) return null;
        const board = Math.round(sim.counters.routeBoardings[id] ?? 0);
        return { kind, id, name: r.name, type: `${r.mode} line · ${r.stationIds.length} stops`, metric: `${board.toLocaleString()} boardings`, x, y };
      }
      if (kind === 'road') {
        const st = sim.edgeState[id];
        if (!st) return null;
        const edge = sim.city.roadEdges.find((e) => e.id === id);
        const label = edge ? `${edge.isBridge ? 'Bridge' : edge.isArterial ? 'Arterial' : 'Local'} ${edge.a.replace(/^rn-/, '').toUpperCase()}–${edge.b.replace(/^rn-/, '').toUpperCase()}` : id;
        return { kind, id, name: label, type: st.closed ? 'Closed road' : `Road, ${st.level} congestion`, metric: `V/C ${Math.round(st.vc * 100) / 100}`, x, y };
      }
      if (kind === 'zone') {
        const z = sim.city.zones.find((zz) => zz.id === id);
        if (!z) return null;
        return { kind, id, name: z.name, type: `District · ${z.kind}`, metric: `${z.population.toLocaleString()} residents`, x, y };
      }
      if (kind === 'vehicle') {
        const vv = sim.vehicles.find((v) => v.id === id);
        if (!vv) return null;
        const r = sim.routes.find((x) => x.id === vv.routeId);
        return { kind, id, name: r?.name ?? vv.routeId, type: 'Vehicle', metric: `${vv.load}/${vv.capacity} aboard`, x, y };
      }
      if (kind === 'incident') {
        const inc = sim.incidents.find((i) => i.id === id);
        if (!inc) return null;
        const left = Math.max(0, Math.round(inc.startMin + inc.durationMin - sim.timeMinutes));
        return { kind, id, name: inc.label, type: `Disruption, ${inc.status}`, metric: inc.status === 'active' ? `~${left} min left` : inc.kind, x, y };
      }
      if (kind === 'problem') {
        const label = problemLabelById.current.get(id) ?? id;
        return { kind, id, name: label, type: 'Planning problem', metric: 'click to explain', x, y };
      }
      return null;
    };
    let lastHoverAt = 0;
    const handleHover = (e: MouseEvent) => {
      const b = buildRef.current;
      if (measureActiveRef.current) {
        pickAt(e);
        if (ray.ray.intersectPlane(groundPlane, groundHit)) {
          onMeasureHoverRef.current?.(groundHit.x, groundHit.z);
        }
        return;
      }
      if (b) {
        pickAt(e);
        if (ray.ray.intersectPlane(groundPlane, groundHit)) {
          b.onHover(groundHit.x, groundHit.z);
        }
        return;
      }
      // Throttled inspection hover: raycast at most ~11×/s (perf §32).
      const now = performance.now();
      if (now - lastHoverAt < 90) return;
      lastHoverAt = now;
      const cb = onHoverRef.current;
      if (!cb) return;
      pickAt(e);
      ray.params.Line = { threshold: 4 };
      const hits = ray.intersectObjects(pickAll(), false);
      const candidates = collectCandidates(hits);
      const top = candidates[0];
      cb(top ? hoverInfoFor(top.kind as Selection['kind'], top.id, e.clientX, e.clientY) : null);
    };
    const handleLeave = () => {
      onHoverRef.current?.(null);
    };
    const handleContext = (e: MouseEvent) => {
      e.preventDefault();
      const cb = onContextRef.current;
      if (!cb || buildRef.current) return;
      pickAt(e);
      ray.params.Line = { threshold: 4 };
      const hits = ray.intersectObjects(pickAll(), false);
      const top = collectCandidates(hits)[0];
      if (top) cb({ kind: top.kind as Selection['kind'], id: top.id }, e.clientX, e.clientY);
    };
    renderer.domElement.addEventListener('click', handleClick);
    renderer.domElement.addEventListener('mousemove', handleHover);
    renderer.domElement.addEventListener('mouseleave', handleLeave);
    renderer.domElement.addEventListener('contextmenu', handleContext);

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
      new THREE.MeshBasicMaterial({ color: MARK.amber }),
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

    // Dispose a removed child's GPU resources. Only safe for meshes/lines
    // built fresh per rebuild — never pass an object whose geometry or
    // material is a shared, reused instance held outside the group.
    const disposeChild = (o: THREE.Object3D) => {
      const geom = (o as THREE.Mesh | THREE.Line).geometry as THREE.BufferGeometry | undefined;
      geom?.dispose();
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    };
    // Dispose every child's geometry/material, then empty the group. Only
    // for groups whose children are all rebuilt fresh each call.
    const clearGroupDisposing = (group: THREE.Group) => {
      for (const child of group.children) disposeChild(child);
      group.clear();
    };

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
      clearGroupDisposing(incidentGroup);
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
        spots.forEach((p, si) => {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 1, 8, 32), markerMat(0xef4444));
          ring.rotation.x = -Math.PI / 2;
          ring.position.copy(p);
          ring.userData = { kind: 'incident', id: inc.id, baseY: p.y, phase: si * 1.1 };
          incidentGroup.add(ring);
        });
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
      refreshExtraPickables();
    };

    // Draft preview: route/road path + hover marker, rebuilt when draft changes.
    const draftGroup = new THREE.Group();
    draftGroup.name = 'draft';
    scene.add(draftGroup);
    let lastDraftKey = '';
    const draftMat = new THREE.LineBasicMaterial({ color: MARK.amber });
    const draftDotGeo = new THREE.SphereGeometry(2.2, 12, 12);
    const draftDotMat = new THREE.MeshBasicMaterial({ color: MARK.amber });
    const hoverDotMat = new THREE.MeshBasicMaterial({ color: MARK.green, transparent: true, opacity: 0.8 });
    const rebuildDraft = () => {
      const d = draftRef.current;
      const key = d ? JSON.stringify(d) : '';
      if (key === lastDraftKey) return;
      lastDraftKey = key;
      // Only the connecting line's geometry is fresh per call; the dot
      // geometry/materials (draftDotGeo/draftDotMat/hoverDotMat) are shared
      // and reused below, so they must survive the clear.
      for (const child of draftGroup.children) {
        if (child instanceof THREE.Line) child.geometry.dispose();
      }
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
        hoverDotMat.color.setHex(d.hoverValid ? MARK.green : 0xef4444);
        const hov = new THREE.Mesh(draftDotGeo, hoverDotMat);
        hov.position.set(d.hover.x, y, d.hover.z);
        draftGroup.add(hov);
      }
    };

    const TONE_COLORS: Record<string, number> = {
      warn: MARK.amber, bad: 0xef4444, info: MARK.blue, good: 0x34d399,
    };
    // Problem + change markers: pooled rings, rebuilt when marker identity changes.
    const problemGroup = new THREE.Group();
    problemGroup.name = 'problems';
    scene.add(problemGroup);
    const changeGroup = new THREE.Group();
    changeGroup.name = 'changes';
    scene.add(changeGroup);
    const markerPos = new Map<string, THREE.Vector3>();
    let lastMarkerKey = '';
    const rebuildMarkers = () => {
      const key = JSON.stringify([problemMarkersRef.current, changeMarkersRef.current]);
      if (key === lastMarkerKey) return;
      lastMarkerKey = key;
      clearGroupDisposing(problemGroup);
      clearGroupDisposing(changeGroup);
      markerPos.clear();
      let phase = 0;
      const add = (group: THREE.Group, m: MapMarker) => {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(6, 1, 8, 28),
          new THREE.MeshBasicMaterial({ color: TONE_COLORS[m.tone] ?? 0xffffff, transparent: true, opacity: 0.9 }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(m.x, 11, m.z);
        ring.userData = { kind: m.selKind, id: m.selId, baseY: 11, phase: phase++ * 0.9 };
        group.add(ring);
        markerPos.set(`${m.selKind}:${m.selId}`, ring.position);
      };
      for (const m of problemMarkersRef.current) add(problemGroup, m);
      for (const m of changeMarkersRef.current) add(changeGroup, m);
      refreshExtraPickables();
    };
    // Walking-catchment rings around the inspected station.
    const catchmentGroup = new THREE.Group();
    catchmentGroup.name = 'catchment';
    scene.add(catchmentGroup);
    let lastCatchKey = '';
    const rebuildCatchment = () => {
      const c = catchmentRef.current;
      const key = c ? JSON.stringify(c) : '';
      if (key === lastCatchKey) return;
      lastCatchKey = key;
      clearGroupDisposing(catchmentGroup);
      if (!c) return;
      for (const r of c.radii) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(Math.max(1, r - 2), r, 72),
          new THREE.MeshBasicMaterial({ color: MARK.blue, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(c.x, 4.5, c.z);
        catchmentGroup.add(ring);
        const fill = new THREE.Mesh(
          new THREE.CircleGeometry(r, 48),
          new THREE.MeshBasicMaterial({ color: MARK.blue, transparent: true, opacity: 0.05, side: THREE.DoubleSide }),
        );
        fill.rotation.x = -Math.PI / 2;
        fill.position.set(c.x, 4.4, c.z);
        catchmentGroup.add(fill);
      }
    };
    // Measurement line + label.
    const measureGroup = new THREE.Group();
    measureGroup.name = 'measure';
    scene.add(measureGroup);
    const measureCanvas = document.createElement('canvas');
    measureCanvas.width = 512 * labelDpr;
    measureCanvas.height = 96 * labelDpr;
    const measureTex = new THREE.CanvasTexture(measureCanvas);
    measureTex.generateMipmaps = false;
    measureTex.minFilter = THREE.LinearFilter;
    measureTex.magFilter = THREE.LinearFilter;
    const measureSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: measureTex, transparent: true, depthTest: false }),
    );
    measureSprite.scale.set(64, 12, 1);
    measureSprite.visible = false;
    measureGroup.add(measureSprite);
    let lastMeasureKey = '';
    const drawMeasureLabel = (text: string, mx: number, mz: number) => {
      const ctx = measureCanvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(labelDpr, 0, 0, labelDpr, 0, 0);
      ctx.clearRect(0, 0, 512, 96);
      ctx.font = '600 40px system-ui, sans-serif';
      const w = Math.min(500, ctx.measureText(text).width + 48);
      ctx.fillStyle = P.label.measureFill;
      ctx.strokeStyle = P.label.measureEdge;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect((512 - w) / 2, 8, w, 80, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = P.label.measureText;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 256, 50);
      measureTex.needsUpdate = true;
      measureSprite.position.set(mx, 14, mz);
      measureSprite.visible = true;
    };
    const rebuildMeasure = () => {
      const m = measureRef.current;
      const key = m ? JSON.stringify(m) : '';
      if (key === lastMeasureKey) return;
      lastMeasureKey = key;
      // Clear previous line/dots but keep the reused label sprite.
      for (let i = measureGroup.children.length - 1; i >= 0; i--) {
        const child = measureGroup.children[i];
        if (child !== measureSprite) {
          disposeChild(child);
          measureGroup.remove(child);
        }
      }
      measureSprite.visible = false;
      if (!m || !m.a) return;
      const end = m.b ?? m.hover;
      const dot = (p: { x: number; z: number }, color: number) => {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(2.4, 12, 12),
          new THREE.MeshBasicMaterial({ color }),
        );
        mesh.position.set(p.x, 8, p.z);
        measureGroup.add(mesh);
      };
      dot(m.a, MARK.blue);
      if (end) {
        dot(end, m.b ? MARK.green : MARK.amber);
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(m.a.x, 8, m.a.z),
            new THREE.Vector3(end.x, 8, end.z),
          ]),
          new THREE.LineBasicMaterial({ color: MARK.blue }),
        );
        measureGroup.add(line);
        drawMeasureLabel(m.label, (m.a.x + end.x) / 2, (m.a.z + end.z) / 2);
      }
    };
    // Text labels: cached canvas sprites, tiered by camera distance.
    const labelGroup = new THREE.Group();
    labelGroup.name = 'labels';
    scene.add(labelGroup);
    const labelCache = new Map<string, THREE.Sprite>();
    // Map labels are set in the interface face, so they read as part of the
    // same signage system. Canvas text can only use a face once it has loaded,
    // so every label is drawn once now and redrawn when the face arrives.
    const LABEL_FONT = '600 30px "Barlow Semi Condensed", Barlow, "Segoe UI", system-ui, sans-serif';
    const labelRedraws: (() => void)[] = [];
    const getLabel = (text: string, accent: string): THREE.Sprite => {
      const key = `${accent}|${text}`;
      const hit = labelCache.get(key);
      if (hit) return hit;
      const canvas = document.createElement('canvas');
      canvas.width = 256 * labelDpr;
      canvas.height = 64 * labelDpr;
      const tex = new THREE.CanvasTexture(canvas);
      // Mipmapping blurs a billboard that's frequently small/distant even
      // further; a flat bilinear sample off the full-resolution canvas
      // stays crisp at any camera distance.
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      sprite.scale.set(34, 8.5, 1);
      const draw = () => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(labelDpr, 0, 0, labelDpr, 0, 0);
        ctx.clearRect(0, 0, 256, 64);
        ctx.font = LABEL_FONT;
        const w = Math.min(248, ctx.measureText(text).width + 36);
        // Share of the sprite the pill actually covers, for collision culling.
        sprite.userData.fill = w / 256;
        ctx.fillStyle = P.label.fill;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect((256 - w) / 2, 6, w, 52, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = P.label.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 33, 232);
        tex.needsUpdate = true;
      };
      draw();
      labelRedraws.push(draw);
      labelCache.set(key, sprite);
      return sprite;
    };
    // prio: lower wins a contested spot on screen.
    interface LabelItem { text: string; accent: string; x: number; y: number; z: number; tier: 0 | 1 | 2; prio: number; }
    const labelItems: LabelItem[] = [];
    {
      const sim0 = simRef.current;
      if (sim0) {
        for (const r of sim0.routes) {
          const mid = r.stationIds[Math.floor(r.stationIds.length / 2)];
          const m = net.stationMeshById.get(mid);
          if (m) labelItems.push({ text: r.name.split(' ')[0], accent: r.color, x: m.position.x, y: 20, z: m.position.z, tier: 0, prio: 2 });
        }
        for (const z of sim0.city.zones) {
          labelItems.push({ text: z.name, accent: P.label.zoneEdge, x: z.center.x, y: 5, z: z.center.z, tier: 0, prio: 1 });
        }
        for (const st of sim0.stations) {
          if (st.routeIds.length > 1) {
            labelItems.push({ text: st.name, accent: P.label.interchangeEdge, x: st.pos.x, y: 15, z: st.pos.z, tier: 1, prio: 0 });
          }
        }
        // Interchanges already carry their own label from the mid tier up, so
        // the every-station tier skips them rather than stacking a second copy.
        for (const st of sim0.stations) {
          if (st.routeIds.length > 1) continue;
          labelItems.push({ text: st.name, accent: P.label.stationEdge, x: st.pos.x, y: 12, z: st.pos.z, tier: 2, prio: 3 });
        }
        labelItems.sort((p, q) => p.prio - q.prio);
      }
    }
    const labelSprites: { sprite: THREE.Sprite; tier: 0 | 1 | 2 }[] = labelItems.map((it) => {
      const sprite = getLabel(it.text, it.accent);
      sprite.position.set(it.x, it.y, it.z);
      labelGroup.add(sprite);
      return { sprite, tier: it.tier };
    });
    if (typeof document !== 'undefined' && document.fonts?.load) {
      void document.fonts.load(LABEL_FONT).then(() => {
        for (const redraw of labelRedraws) redraw();
      });
    }
    const labelNdc = new THREE.Vector3();
    const labelRects: { x0: number; x1: number; y0: number; y1: number }[] = [];
    // Direction cones along routes (selected route, or all in flow overlay).
    const dirGroup = new THREE.Group();
    dirGroup.name = 'directions';
    scene.add(dirGroup);
    const coneGeo = new THREE.ConeGeometry(2.4, 6, 10);
    const coneMatByRoute = new Map<string, THREE.MeshBasicMaterial>();
    const dirCones: { mesh: THREE.Mesh; routeId: string; t: number }[] = [];
    {
      const sim0 = simRef.current;
      if (sim0) {
        for (const r of sim0.routes) {
          let mat = coneMatByRoute.get(r.id);
          if (!mat) {
            mat = new THREE.MeshBasicMaterial({ color: r.color });
            coneMatByRoute.set(r.id, mat);
          }
          for (const t of [0.3, 0.55, 0.8]) {
            const mesh = new THREE.Mesh(coneGeo, mat);
            mesh.userData.routeId = r.id;
            dirGroup.add(mesh);
            dirCones.push({ mesh, routeId: r.id, t });
          }
        }
      }
    }
    const conePos = new THREE.Vector3();
    const coneTan = new THREE.Vector3();
    const coneUp = new THREE.Vector3(0, 1, 0);
    const refreshExtraPickables = () => {
      extraPickables.length = 0;
      for (const [, mesh] of rig.meshById) extraPickables.push(mesh);
      for (const child of incidentGroup.children) extraPickables.push(child);
      for (const child of problemGroup.children) extraPickables.push(child);
      for (const child of changeGroup.children) extraPickables.push(child);
    };

    const loadColor = new THREE.Color();
    const baseColor = new THREE.Color(STATION.regular);
    const hotColor = new THREE.Color(0xef4444);
    const routeBase = new THREE.Color();
    const routeHot = new THREE.Color(light ? 0x111827 : 0xffffff);
    const groundTone = new THREE.Color(SCENE.land);
    const rampNavy = new THREE.Color(RAMP.blueHigh);
    const rampDeepGreen = new THREE.Color(RAMP.greenHigh);
    let raf = 0;
    let elapsed = 0;
    let lastFrame = performance.now();
    let frame = 0;
    // Smooth camera commands: eased glide, cancelled by user input.
    let appliedCamSeq = 0;
    let camAnim: { fp: THREE.Vector3; ft: THREE.Vector3; tp: THREE.Vector3; tt: THREE.Vector3; t0: number } | null = null;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const cancelCamAnim = () => {
      camAnim = null;
    };
    controls.addEventListener('start', cancelCamAnim);
    let lastCamReport = 0;
    const lastReported = new THREE.Vector3(1e9, 0, 0);
    const lastReportedTarget = new THREE.Vector3(0, 0, 0);
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      elapsed += dt;
      lastFrame = now;
      frame++;
      // Camera commands from presets / focus / minimap / search.
      const cmd = cameraCmdRef.current;
      if (cmd && cmd.seq !== appliedCamSeq) {
        appliedCamSeq = cmd.seq;
        const tp = new THREE.Vector3(cmd.pose.pos[0], cmd.pose.pos[1], cmd.pose.pos[2]);
        const tt = new THREE.Vector3(cmd.pose.target[0], cmd.pose.target[1], cmd.pose.target[2]);
        if (reducedMotion) {
          camera.position.copy(tp);
          controls.target.copy(tt);
          camAnim = null;
        } else {
          camAnim = { fp: camera.position.clone(), ft: controls.target.clone(), tp, tt, t0: now };
        }
      }
      if (camAnim) {
        const k = Math.min(1, (now - camAnim.t0) / 650);
        const e = k * k * (3 - 2 * k);
        camera.position.lerpVectors(camAnim.fp, camAnim.tp, e);
        controls.target.lerpVectors(camAnim.ft, camAnim.tt, e);
        if (k >= 1) camAnim = null;
      }
      const cur = simRef.current;
      if (cur) {
        syncVehicleMeshes(rig, cur.vehicles, cur.routes, cur.stations);
        updateVehicles(rig, cur.vehicles, dt);
        updateCarRig(carRig, cur.cars, edgeLen);
        rebuildDraft();
        rebuildMarkers();
        rebuildCatchment();
        rebuildMeasure();
        // Vehicle meshes come and go with the fleet; keep picking fresh.
        if (frame % 60 === 0) refreshExtraPickables();
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
            mat.emissiveIntensity = light ? 0.25 : 0.45;
          } else if (ov === 'status') {
            const st = cur.edgeState[id];
            if (st?.closed) {
              mat.color.setHex(0xef4444);
              mat.emissive.setHex(0xef4444);
              mat.emissiveIntensity = light ? 0.4 + 0.2 * Math.sin(elapsed * 5) : 0.8 + 0.4 * Math.sin(elapsed * 5);
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
            mat.emissiveIntensity = light ? 0.6 + 0.3 * Math.sin(elapsed * 4) : 1.6 + 0.8 * Math.sin(elapsed * 4);
          } else if (ov === 'flow') {
            routeBase.set(mesh.userData.baseColor as string);
            mat.color.copy(routeBase).lerp(routeHot, u * (light ? 0.6 : 0.45));
            mat.emissive.copy(routeBase);
            mat.emissiveIntensity = light ? 0.2 + 0.3 * u : 0.15 + 2.4 * u;
          } else if (ov === 'frequency') {
            // Scheduled peak headway: intense = frequent service.
            const h = cur.service[id]?.peakHeadwayMin ?? 15;
            const f = Math.min(1, Math.max(0, 1 - (h - 3) / 27));
            routeBase.set(mesh.userData.baseColor as string);
            mat.color.copy(routeBase).lerp(routeHot, f * (light ? 0.55 : 0.3));
            mat.emissive.copy(routeBase);
            mat.emissiveIntensity = light ? 0.2 + 0.25 * f : 0.15 + 2.2 * f;
          } else if (ov === 'crowding') {            // Live occupancy: frequent-but-empty looks different from packed.
            const occ = occN[id] ? occSum[id] / occN[id] : 0;
            routeBase.set(mesh.userData.baseColor as string);
            if (occ >= 0.9) {
              mat.color.setHex(0xef4444);
              mat.emissive.setHex(0xef4444);
              mat.emissiveIntensity = light ? 0.6 + 0.3 * Math.sin(elapsed * 5) : 1.4 + 0.8 * Math.sin(elapsed * 5);
            } else if (occ >= 0.7) {
              mat.color.copy(routeBase).lerp(routeHot, 0.35);
              mat.emissive.setHex(0xfb923c);
              mat.emissiveIntensity = light ? 0.5 : 1.1;
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
              mat.emissiveIntensity = light ? 0.6 + 0.3 * Math.sin(elapsed * 5) : 1.2 + 0.6 * Math.sin(elapsed * 5);
            } else if (reduced) {
              routeBase.set(mesh.userData.baseColor as string);
              mat.color.copy(routeBase).lerp(routeHot, 0.3);
              mat.emissive.setHex(0xfb923c);
              mat.emissiveIntensity = light ? 0.5 : 0.9;
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
              if (t === null || t === undefined) mat.color.setHex(RAMP.none);
              else {
                const f = Math.min(1, t / Math.max(1, av.travelMax));
                loadColor.setHex(0x34d399).lerp(hotColor, f);
                mat.color.copy(loadColor);
              }
            } else if (ov === 'coverage') {
              const f = Math.min(1, Math.max(0, (av.coverage[id] ?? 0) / 100));
              loadColor.setHex(RAMP.blueLow).lerp(rampNavy, f);
              mat.color.copy(loadColor);
            } else if (ov === 'popdensity' || ov === 'jobdensity') {
              const max = ov === 'popdensity' ? av.popMax : av.jobMax;
              const v = ov === 'popdensity' ? (av.popD[id] ?? 0) : (av.jobD[id] ?? 0);
              const f = max > 0 ? Math.min(1, v / max) : 0;
              loadColor.setHex(RAMP.blueLow).lerp(rampNavy, 0.1 + f * 0.9);
              mat.color.copy(loadColor);
            } else if (ov === 'development') {
              const d = av.dev[id] ?? 0;
              mat.color.setHex(
                d >= 0.85 ? 0xef4444 : d >= 0.65 ? 0xfb923c : d >= 0.4 ? 0xfacc15 : d >= 0.15 ? 0x34d399 : RAMP.none,
              );
            } else if (ov === 'growth') {
              const f = av.growthMax > 0 ? Math.min(1, Math.max(0, (av.growth[id] ?? 0) / av.growthMax)) : 0;
              loadColor.setHex(RAMP.greenLow).lerp(rampDeepGreen, 0.1 + f * 0.9);
              mat.color.copy(loadColor);
            } else {
              // demand
              const f = av.demandMax > 0 ? Math.min(1, (av.demand[id] ?? 0) / av.demandMax) : 0;
              loadColor.setHex(0x34d399).lerp(hotColor, f);
              mat.color.copy(loadColor);
            }
          } else {
            mat.opacity = 0.05;
            mat.color.setHex(MARK.blue);
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
          mat.emissiveIntensity = ov === 'load' ? (light ? 0.1 + 0.6 * load : 0.3 + 1.8 * load) : light ? 0.1 : 0.4;
          let sc = ov === 'load' ? 1 + load * 0.6 : 1;
          if (bottleneckSet?.has(id)) {
            mat.emissive.setHex(0xef4444);
            mat.emissiveIntensity = light ? 0.6 + 0.4 * Math.sin(elapsed * 5) : 1.2 + 0.8 * Math.sin(elapsed * 5);
            sc = Math.max(sc, 1.35);
          }
          if (ov === 'status' && cur.closures.closedStations.has(id)) {
            mat.color.setHex(0xef4444);
            mat.emissive.setHex(0xef4444);
            mat.emissiveIntensity = light ? 0.6 + 0.3 * Math.sin(elapsed * 5) : 1.2 + 0.6 * Math.sin(elapsed * 5);
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
          const selStation = selectionRef.current;
          if (selStation?.kind === 'station' && id === selStation.id) {
            sc = Math.max(sc, 1.5);
            mat.emissive.setHex(MARK.amber);
            mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 0.9);
          }
          mesh.scale.set(sc, 1, sc);
        }
        // Selection emphasis: the selected route glows while others dim (§31 —
        // at any moment it must be obvious what is selected).
        const sel = selectionRef.current;
        if (sel?.kind === 'route') {
          for (const [id, mesh] of net.routeMeshById) {
            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (id === sel.id) {
              mat.emissiveIntensity = Math.max(mat.emissiveIntensity, light ? 0.8 : 1.6);
            } else {
              // Not cumulative: the loop above reset mat.color from its base
              // earlier this frame, so this dims a fresh colour exactly once.
              if (light) mat.color.lerp(groundTone, 0.6);
              else mat.color.multiplyScalar(0.5);
            }
          }
        }
        if (sel?.kind === 'road') {
          const mesh = city.roadMeshById.get(sel.id);
          if (mesh) {
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.emissive.setHex(MARK.amber);
            mat.emissiveIntensity = 0.9;
          }
        }
        // Problem + incident markers bob; the selected one pulses larger.
        for (const group of [incidentGroup, problemGroup, changeGroup]) {
          for (const child of group.children) {
            const mesh = child as THREE.Mesh;
            const ud = mesh.userData as { baseY?: number; phase?: number; kind?: string; id?: string };
            if (ud.baseY !== undefined) {
              mesh.position.y = ud.baseY + Math.sin(elapsed * 2 + (ud.phase ?? 0)) * 1.2;
            }
            const isSel =
              (sel?.kind === 'incident' && ud.kind === 'incident' && ud.id === sel.id) ||
              (sel?.kind === 'problem' && ud.kind === 'problem' && ud.id === sel.id);
            const s = isSel ? 1.4 + 0.15 * Math.sin(elapsed * 5) : 1;
            mesh.scale.set(s, s, s);
          }
        }
        // Direction cones: selected route always, all routes in flow overlay.
        {
          const showAll = overlayRef.current === 'flow';
          const selRoute = sel?.kind === 'route' ? sel.id : null;
          for (const c of dirCones) {
            const visible = c.routeId === selRoute || (showAll && c.routeId !== selRoute);
            c.mesh.visible = visible;
            if (!visible) continue;
            const seg = rig.segmentsByRoute.get(c.routeId);
            const curve = seg?.curve;
            if (!curve) {
              c.mesh.visible = false;
              continue;
            }
            curve.getPointAt(c.t, conePos);
            curve.getTangentAt(c.t, coneTan);
            conePos.y += 3;
            c.mesh.position.copy(conePos);
            c.mesh.quaternion.setFromUnitVectors(coneUp, coneTan.clone().setY(0).normalize());
          }
        }
        // Label tiers by camera distance: routes + districts far, interchanges
        // mid-range, every station close. Never thousands of DOM nodes — these
        // are pooled sprites (perf §32).
        {
          const dist = camera.position.distanceTo(controls.target);
          const tier = dist > 650 ? 0 : dist > 300 ? 1 : 2;
          labelGroup.visible = layersRef.current.labels;
          if (labelGroup.visible) {
            // Greedy placement in priority order: a label that would sit on
            // top of one already placed stays hidden until the camera moves.
            const vw = renderer.domElement.clientWidth;
            const vh = renderer.domElement.clientHeight;
            const pxPerUnit = vh / (2 * Math.tan((camera.fov * Math.PI) / 360));
            labelRects.length = 0;
            for (const l of labelSprites) {
              const sp = l.sprite;
              sp.visible = false;
              if (l.tier > tier) continue;
              labelNdc.copy(sp.position).project(camera);
              if (labelNdc.z > 1 || Math.abs(labelNdc.x) > 1.15 || Math.abs(labelNdc.y) > 1.15) continue;
              const scale = pxPerUnit / Math.max(1, camera.position.distanceTo(sp.position));
              const halfW = (sp.scale.x * (sp.userData.fill ?? 1) * scale) / 2 + 3;
              const halfH = (sp.scale.y * 0.82 * scale) / 2 + 2;
              const cx = ((labelNdc.x + 1) / 2) * vw;
              const cy = ((1 - labelNdc.y) / 2) * vh;
              const rect = { x0: cx - halfW, x1: cx + halfW, y0: cy - halfH, y1: cy + halfH };
              let clear = true;
              for (const r of labelRects) {
                if (rect.x0 < r.x1 && rect.x1 > r.x0 && rect.y0 < r.y1 && rect.y1 > r.y0) {
                  clear = false;
                  break;
                }
              }
              if (!clear) continue;
              labelRects.push(rect);
              sp.visible = true;
            }
          }
        }
        problemGroup.visible = layersRef.current.problems;
        rig.group.visible = layersRef.current.vehicles;
        // Incident markers follow the active incident set.
        rebuildIncidentMarkers(cur.closureSig);
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
        } else if (sel && sel.kind === 'vehicle') {
          const mesh = rig.meshById.get(sel.id);
          if (mesh) {
            selRing.visible = true;
            selRing.position.set(mesh.position.x, mesh.position.y + 1, mesh.position.z);
          } else selRing.visible = false;
        } else if (sel && (sel.kind === 'incident' || sel.kind === 'problem')) {
          const at = markerPos.get(`${sel.kind}:${sel.id}`);
          if (at) {
            selRing.visible = true;
            selRing.position.set(at.x, at.y, at.z);
          } else selRing.visible = false;
        } else selRing.visible = false;
        const L = layersRef.current;
        net.byMode.metro.visible = L.metro;
        net.byMode.rail.visible = L.rail;
        net.byMode.bus.visible = L.bus;
        city.roads.visible = L.roads;
        city.buildings.visible = L.buildings;
      }
      const reportCb = onCameraRef.current;
      if (reportCb && now - lastCamReport > 250) {
        if (camera.position.distanceTo(lastReported) > 1 || controls.target.distanceTo(lastReportedTarget) > 1) {
          lastCamReport = now;
          lastReported.copy(camera.position);
          lastReportedTarget.copy(controls.target);
          reportCb({
            pos: [camera.position.x, camera.position.y, camera.position.z],
            target: [controls.target.x, controls.target.y, controls.target.z],
            dist: camera.position.distanceTo(controls.target),
          });
        }
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
      renderer.domElement.removeEventListener('mouseleave', handleLeave);
      renderer.domElement.removeEventListener('contextmenu', handleContext);
      controls.removeEventListener('start', cancelCamAnim);
      poseRef.current = { pos: camera.position.toArray(), target: controls.target.toArray() };
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
  }, [networkKey, theme, simRef]);

  return <div ref={mountRef} className="scene-mount" aria-label="TransitForge 3D viewport" />;
}
