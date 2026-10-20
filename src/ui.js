// ============================================================
// PERSONA 3 — Interfaz, controles y visualizacion
// ============================================================
// Responsabilidades:
//   - Armar el layout HTML/CSS de la app
//   - Crear controles (color, grosor, limpiar, exportar)
//   - Renderizar la escena 3D (Three.js)
//   - Dibujar el trail de esferas
//   - Mostrar feedback visual del gesto detectado
//
// NO tocar: handTracker.js ni gestureInterpreter.js
// ============================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BOX = 130;
const TRAIL_MAX = 200;
const trail = [];

let scene, camera, renderer, controls;
let trailGroup;

/**
 * Inicializa la escena 3D con Three.js.
 * @param {HTMLCanvasElement} canvasEl
 *
 * TODO Persona 3:
 *   1. Mejorar iluminacion y materiales
 *   2. Agregar grilla y ejes como en base.jsx
 *   3. Agregar controles de UI (botones, selectores)
 *   4. Estilizar con CSS
 */
export function initScene(canvasEl) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  camera = new THREE.PerspectiveCamera(60, canvasEl.clientWidth / canvasEl.clientHeight, 1, 4000);
  camera.position.set(BOX * 1.7, BOX * 0.9, BOX * 2);

  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
  renderer.setSize(canvasEl.clientWidth, canvasEl.clientHeight);

  controls = new OrbitControls(camera, canvasEl);
  controls.enableDamping = true;

  // Luces basicas
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(BOX, BOX, BOX);
  scene.add(dirLight);

  // Grilla de piso
  const gridHelper = new THREE.GridHelper(BOX * 2, 10, 0x444466, 0x333355);
  scene.add(gridHelper);

  // Ejes
  const axesHelper = new THREE.AxesHelper(BOX * 0.4);
  scene.add(axesHelper);

  // Grupo para las esferas del trail
  trailGroup = new THREE.Group();
  scene.add(trailGroup);
}

/**
 * Agrega un punto al trail y renderiza un frame.
 * @param {object} poseData — viene de gestureInterpreter.js
 */
export function renderFrame(poseData) {
  if (!renderer) return;

  // Agregar esfera al trail si esta pintando
  if (poseData.gesture === 'paint') {
    const { x, y, z } = poseData.position;
    const [r, g, b] = poseData.color;
    trail.push({ x, y, z, r, g, b });
    if (trail.length > TRAIL_MAX) trail.shift();
  }

  // Limpiar si el gesto es clear
  if (poseData.gesture === 'clear') {
    trail.length = 0;
  }

  // Reconstruir esferas del trail
  // TODO Persona 3: optimizar — no recrear todo cada frame
  while (trailGroup.children.length > 0) {
    const child = trailGroup.children[0];
    child.geometry.dispose();
    child.material.dispose();
    trailGroup.remove(child);
  }

  for (let i = 0; i < trail.length; i++) {
    const p = trail[i];
    const alpha = (i + 1) / trail.length;
    const size = 2.4 * (0.4 + 0.6 * alpha);
    const geo = new THREE.SphereGeometry(size, 8, 6);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(p.r, p.g, p.b),
      emissive: new THREE.Color(p.r * 0.3, p.g * 0.3, p.b * 0.3),
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.x, p.y, p.z);
    trailGroup.add(mesh);
  }

  controls.update();
  renderer.render(scene, camera);
}

/**
 * Limpia todo el trail.
 */
export function clearTrail() {
  trail.length = 0;
}
