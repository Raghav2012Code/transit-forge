import * as THREE from 'three';
import type { Building } from '../../types/index.ts';
import type { ScenePalette } from '../palette.ts';

const CELL_W = 2.9; // metres of facade per window bay
const CELL_H = 3.3; // metres per floor
const ATLAS = 4; // the texture holds ATLAS x ATLAS bays before it repeats

/** Stable pseudo-random in [0, 1) from an integer, so the same building always looks the same. */
export function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

let atlas: { color: THREE.CanvasTexture; lit: THREE.CanvasTexture } | null = null;

/** A 4x4 atlas of window bays: the glass colour map, and a matching map of which bays are lit. */
function windowAtlas(): { color: THREE.CanvasTexture; lit: THREE.CanvasTexture } {
  if (atlas) return atlas;
  const cell = 64;
  const size = cell * ATLAS;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    return c;
  };
  const colorCanvas = mk();
  const litCanvas = mk();
  const cc = colorCanvas.getContext('2d');
  const lc = litCanvas.getContext('2d');
  if (!cc || !lc) throw new Error('canvas unavailable');
  cc.fillStyle = '#ffffff';
  cc.fillRect(0, 0, size, size);
  lc.fillStyle = '#000000';
  lc.fillRect(0, 0, size, size);
  for (let i = 0; i < ATLAS; i++) {
    for (let j = 0; j < ATLAS; j++) {
      const r = hash01(i * 7 + j * 13 + 3);
      const x = i * cell;
      const y = j * cell;
      // Spandrel: the slightly darker band under each sill.
      cc.fillStyle = '#e4e7ec';
      cc.fillRect(x, y + cell * 0.74, cell, cell * 0.26);
      // Glass: mostly cool slate, a few brighter reflections.
      const g = Math.round(150 + r * 36);
      cc.fillStyle = `rgb(${g - 22},${g - 8},${g + 14})`;
      cc.fillRect(x + cell * 0.17, y + cell * 0.16, cell * 0.66, cell * 0.52);
      // Mullion.
      cc.fillStyle = '#f4f5f7';
      cc.fillRect(x + cell * 0.49, y + cell * 0.16, cell * 0.03, cell * 0.52);
      if (r > 0.45) {
        lc.fillStyle = r > 0.8 ? '#ffe2a8' : '#cfd9f2';
        lc.fillRect(x + cell * 0.17, y + cell * 0.16, cell * 0.66, cell * 0.52);
      }
    }
  }
  const tex = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  atlas = { color: tex(colorCanvas), lit: tex(litCanvas) };
  return atlas;
}

/**
 * Facades tile in metres, not in stretched box UVs: the shader reads each
 * instance's scale, so a 90 m tower gets 26 floors and a 6 m house gets two.
 * Roofs sample a plain wall texel.
 */
function facadeMaterial(lit: number): THREE.MeshStandardMaterial {
  const { color, lit: litMap } = windowAtlas();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: color,
    emissive: 0xffffff,
    emissiveMap: litMap,
    emissiveIntensity: lit,
    roughness: 0.85,
    metalness: 0,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      #ifdef USE_INSTANCING
        vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec3 an = abs(normal);
        // Sheds and container stacks are plain walls; only block buildings have glazing.
        bool shed = (isc.y < 15.0 && max(isc.x, isc.z) > 28.0) || (isc.y < 9.5 && max(isc.x, isc.z) > 9.0 && min(isc.x, isc.z) < 8.0);
        if (an.y > 0.5 || shed) {
          vMapUv = vec2(0.012);
        } else {
          float run = an.x > 0.5 ? isc.z : isc.x;
          vMapUv = vec2(uv.x * run / (${CELL_W.toFixed(2)} * ${ATLAS}.0), uv.y * isc.y / (${CELL_H.toFixed(2)} * ${ATLAS}.0));
        }
        #ifdef USE_EMISSIVEMAP
          vEmissiveMapUv = vMapUv;
        #endif
      #endif`,
    );
  };
  mat.customProgramCacheKey = () => 'tf-facade';
  return mat;
}

export interface BuildingMeshes {
  group: THREE.Group;
  /** Buildings actually drawn (after clearing the transit corridors). */
  count: number;
}

/**
 * Block buildings as three instanced meshes: facades, rooftop plant and
 * masts. `skip` lets the caller clear room for viaducts and platforms.
 */
export function buildBuildings(buildings: Building[], palette: ScenePalette, skip: (b: Building) => boolean, dark: boolean): BuildingMeshes {
  const group = new THREE.Group();
  group.name = 'buildings';
  const kept = buildings.filter((b) => !skip(b));

  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const facades = new THREE.InstancedMesh(geo, facadeMaterial(dark ? 0.55 : 0), kept.length);
  facades.castShadow = true;
  facades.receiveShadow = true;

  const plantGeo = new THREE.BoxGeometry(1, 1, 1);
  plantGeo.translate(0, 0.5, 0);
  const plantMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const plants: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const masts: { m: THREE.Matrix4; c: THREE.Color }[] = [];

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const roof = new THREE.Color(palette.scene.roadArterial);

  kept.forEach((b, i) => {
    dummy.position.set(b.pos.x, 0, b.pos.z);
    dummy.rotation.set(0, b.rot, 0);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.updateMatrix();
    facades.setMatrixAt(i, dummy.matrix);
    const shade = (hash01(i + 11) - 0.5) * (b.district === 'cbd' ? 0.16 : 0.09);
    color.setHex(palette.district[b.district]).offsetHSL(0, 0, shade);
    facades.setColorAt(i, color);

    if (b.h > 16 && b.w > 8 && b.d > 8) {
      // Rooftop plant: one or two boxes set back from the parapet.
      const n = b.h > 40 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const w = b.w * (0.22 + 0.16 * hash01(i * 3 + k));
        const d = b.d * (0.22 + 0.16 * hash01(i * 5 + k + 1));
        const ox = (hash01(i * 7 + k) - 0.5) * (b.w - w) * 0.7;
        const oz = (hash01(i * 11 + k) - 0.5) * (b.d - d) * 0.7;
        const c = Math.cos(b.rot);
        const s = Math.sin(b.rot);
        dummy.position.set(b.pos.x + ox * c + oz * s, b.h, b.pos.z - ox * s + oz * c);
        dummy.scale.set(w, 1.6 + hash01(i + k) * 2.2, d);
        dummy.updateMatrix();
        plants.push({ m: dummy.matrix.clone(), c: roof.clone().offsetHSL(0, 0, -0.06 * (k + 1)) });
      }
    }
    if (b.h > 78) {
      dummy.position.set(b.pos.x, b.h, b.pos.z);
      dummy.scale.set(0.7, 14, 0.7);
      dummy.updateMatrix();
      masts.push({ m: dummy.matrix.clone(), c: roof.clone().offsetHSL(0, 0, -0.18) });
    }
  });
  facades.instanceMatrix.needsUpdate = true;
  if (facades.instanceColor) facades.instanceColor.needsUpdate = true;
  group.add(facades);

  for (const list of [plants, masts]) {
    if (list.length === 0) continue;
    const mesh = new THREE.InstancedMesh(plantGeo, plantMat, list.length);
    list.forEach((e, i) => {
      mesh.setMatrixAt(i, e.m);
      mesh.setColorAt(i, e.c);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { group, count: kept.length };
}
