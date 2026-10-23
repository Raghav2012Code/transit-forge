import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DRAG_THRESHOLD_PX, edgeMidpointXZ, isDrag, isVisibleInChain } from './picking.ts';

describe('isDrag', () => {
  it('keeps a still pointer a click', () => {
    expect(isDrag(0, 0)).toBe(false);
    expect(isDrag(DRAG_THRESHOLD_PX, 0)).toBe(false);
  });

  it('suppresses the click once the pointer travels past the threshold', () => {
    expect(isDrag(DRAG_THRESHOLD_PX + 1, 0)).toBe(true);
    expect(isDrag(3, 3)).toBe(true); // 4.24px diagonal
  });

  it('honours a custom threshold', () => {
    expect(isDrag(2, 0, 1)).toBe(true);
  });
});

describe('isVisibleInChain', () => {
  it('follows visibility up through the ancestors', () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    const mesh = new THREE.Mesh();
    scene.add(group);
    group.add(mesh);
    expect(isVisibleInChain(mesh)).toBe(true);
    group.visible = false;
    expect(isVisibleInChain(mesh)).toBe(false);
    group.visible = true;
    mesh.visible = false;
    expect(isVisibleInChain(mesh)).toBe(false);
  });
});

describe('edgeMidpointXZ', () => {
  it('lands on the closed edge, not the map origin', () => {
    expect(edgeMidpointXZ({ x: 20, z: -8 }, { x: 60, z: 12 })).toEqual({ x: 40, z: 2 });
  });
});
