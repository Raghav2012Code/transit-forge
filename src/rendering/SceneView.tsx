import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Rendering layer: consumes simulation state, contains no simulation logic.
// Scaffold scene only — procedural city lands here next.
export default function SceneView() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1020);

    const camera = new THREE.PerspectiveCamera(
      50,
      mount.clientWidth / mount.clientHeight,
      0.1,
      2000,
    );
    camera.position.set(60, 55, 60);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;

    scene.add(new THREE.GridHelper(120, 24, 0x3a4a6b, 0x1c2742));

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(40, 60, 20);
    scene.add(sun);

    // Placeholder blocks marking future districts (CBD center, suburbs ring).
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const matCbd = new THREE.MeshStandardMaterial({ color: 0x6ea8fe });
    const matSub = new THREE.MeshStandardMaterial({ color: 0x2f3b55 });
    const blocks: THREE.Mesh[] = [];
    for (let i = 0; i < 40; i++) {
      const isCbd = i < 8;
      const mesh = new THREE.Mesh(geo, isCbd ? matCbd : matSub);
      const angle = (i / 40) * Math.PI * 2;
      const radius = isCbd ? 6 + (i % 4) * 2.5 : 22 + (i % 10) * 3;
      const h = isCbd ? 10 + (i % 4) * 4 : 2 + (i % 5);
      mesh.scale.set(3, h, 3);
      mesh.position.set(Math.cos(angle) * radius, h / 2, Math.sin(angle) * radius);
      scene.add(mesh);
      blocks.push(mesh);
    }

    let raf = 0;
    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      geo.dispose();
      matCbd.dispose();
      matSub.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="scene-mount" aria-label="TransitForge 3D viewport" />;
}
