import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SimulationState } from '../simulation/index.ts';
import type { CongestionLevel } from '../types/index.ts';
import { buildCityMeshes } from './city/buildCity.ts';
import { buildNetworkMeshes } from './transport/buildNetwork.ts';
import { buildVehicles, updateVehicles } from './vehicles/vehicles.ts';
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

export type Overlay = 'normal' | 'flow' | 'load' | 'congestion';

interface SceneViewProps {
  simRef: React.RefObject<SimulationState>;
  layers: Layers;
  overlay: Overlay;
  selection: Selection | null;
  onSelect: (sel: Selection | null) => void;
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

// Rendering consumes simulation data; it never mutates it or holds sim logic.
export default function SceneView({ simRef, layers, overlay, selection, onSelect }: SceneViewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const rigRef = useRef<{
    stationMeshById: Map<string, THREE.Mesh>;
    pickables: THREE.Object3D[];
    groups: { metro: THREE.Group; rail: THREE.Group; bus: THREE.Group; roads: THREE.Group; buildings: THREE.Group };
  } | null>(null);
  const selectionRef = useRef<Selection | null>(selection);
  selectionRef.current = selection;

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
    const handleClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ptr.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ptr.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(ptr, camera);
      ray.params.Line = { threshold: 4 };
      const hits = ray.intersectObjects(pickables, false);
      if (hits.length === 0) {
        onSelectRef.current(null);
        return;
      }
      const ud = hits[0].object.userData as { kind: Selection['kind']; id: string };
      onSelectRef.current({ kind: ud.kind, id: ud.id });
    };
    renderer.domElement.addEventListener('click', handleClick);

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

    const loadColor = new THREE.Color();
    const baseColor = new THREE.Color(0xcbd5e1);
    const hotColor = new THREE.Color(0xef4444);
    const routeBase = new THREE.Color();
    const routeHot = new THREE.Color(0xffffff);
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const cur = simRef.current;
      if (cur) {
        updateVehicles(rig, cur.vehicles);
        updateCarRig(carRig, cur.cars, edgeLen);
        const ov = overlayRef.current;
        // Road congestion colors from live volume/capacity (congestion overlay).
        for (const [id, mesh] of city.roadMeshById) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (ov === 'congestion') {
            const level = cur.edgeState[id]?.level ?? 'free';
            mat.color.setHex(CONGESTION_COLORS[level]);
            mat.emissive.setHex(CONGESTION_COLORS[level]);
            mat.emissiveIntensity = 0.45;
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
        for (const [id, mesh] of net.routeMeshById) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          const u = Math.min(1, (usage[id] ?? 0) / maxUse);
          if (ov === 'flow') {
            routeBase.set(mesh.userData.baseColor as string);
            mat.color.copy(routeBase).lerp(routeHot, u * 0.45);
            mat.emissive.copy(routeBase);
            mat.emissiveIntensity = 0.15 + 2.4 * u;
          } else {
            routeBase.set(mesh.userData.baseColor as string);
            mat.color.copy(routeBase);
            mat.emissive.copy(routeBase);
            mat.emissiveIntensity = ov === 'load' ? 0.12 : 0.35;
          }
        }
        // Station load tint (data-driven, no sim logic here).
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
          const sc = ov === 'load' ? 1 + load * 0.6 : 1;
          mesh.scale.set(sc, 1, sc);
        }
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
    // Static geometry builds once per mount; dynamic data flows via simRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={mountRef} className="scene-mount" aria-label="TransitForge 3D viewport" />;
}
