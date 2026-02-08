import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createDurerWireframe } from './durer';

export type SceneHandle = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  world: THREE.Group;
  surfaceMesh: THREE.Mesh;
  resize: () => void;
  update: (dt: number) => void;
};

export function createScene(mount: HTMLElement): SceneHandle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030405);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 3000);
  camera.position.set(0, 0, 520);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  mount.appendChild(renderer.domElement);

  const world = new THREE.Group();
  scene.add(world);

  const { mesh, edges } = createDurerWireframe(160, 0.45);
  world.add(mesh);
  world.add(edges);

  const surfaceMesh = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ visible: false }));
  world.add(surfaceMesh);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.minDistance = 210;
  controls.maxDistance = 900;

  function resize() {
    const r = mount.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  }

  function update(_dt: number) {
    controls.update();
  }

  window.addEventListener('resize', resize);
  resize();

  return { scene, camera, renderer, controls, world, surfaceMesh, resize, update };
}

