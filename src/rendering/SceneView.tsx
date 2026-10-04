import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SimulationState } from '../simulation/index.ts';
import { buildCityMeshes } from './city/buildCity.ts';
import { buildNetworkMeshes } from './transport/buildNetwork.ts';
import { buildVehicles, updateVehicles } from './vehicles/vehicles.ts';

export interface Layers {
  metro: boolean;
  rail: boolean;
  bus: boolean;
  roads: boolean;
  buildings: boolean;
}

export interface Selection {
  kind: 'station' | 'route' | 'zone';
  id: string;
}

interface SceneViewProps {
  simRef: React.RefObject<SimulationState>;
  layers: Layers;
  selection: Selection | null;
  onSelect: (sel: Selection | null) => void;
}

function stationLoad(waiting: number, capacityPerHr: number): number {
  return Math.min(1, waiting / Math.max(1, capacityPerHr * 0.25));
}

// Rendering consumes simulation data; it never mutates it or holds sim logic.
export default function SceneView({ simRef, layers, selection, onSelect }: SceneViewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const layersRef = useRef(layers);
  layersRef.current = layers;
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
    const pickables = [...net.pickables];
    // Zone discs for district picking.
    city.group.children.forEach((c) => {
      if (c.userData?.kind === 'zone') pickables.push(c);
    });
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
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const cur = simRef.current;
      if (cur) {
        updateVehicles(rig, cur.vehicles);
        // Station load tint (data-driven, no sim logic here).
        const byId = new Map(cur.stations.map((s) => [s.id, s]));
        for (const [id, mesh] of net.stationMeshById) {
          const st = byId.get(id);
          if (!st) continue;
          const load = stationLoad(st.waiting, st.capacityPerHr);
          const mat = mesh.material as THREE.MeshStandardMaterial;
          loadColor.copy(baseColor).lerp(hotColor, load);
          mat.color.copy(loadColor);
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
