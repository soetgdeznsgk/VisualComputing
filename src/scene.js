// ============================================================
// scene.js — Escena 3D: renderer, luces y mesa de juego
// ============================================================
// Dibuja todo lo que es "fijo" en el mundo: la mesa de madera con su
// borde, el tapete del tablero actual, el piso, las luces y las sombras.
// Las piezas se dibujan en pieceViews.js y la camara esta en cameraRig.js.
// ============================================================

import * as THREE from 'three';
import { TABLE, CAMERA } from './config.js';
import { tableParts } from './sim/table.js';
import { getWoodTexture, applyBoxUV } from './woodTexture.js';

export let scene;
export let camera;
export let renderer;

/**
 * Inicializa renderer, escena, luces y mesa.
 * @param {HTMLCanvasElement} canvasEl
 */
export function initScene(canvasEl) {
  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d2233);
  scene.fog = new THREE.Fog(0x1d2233, 90, 180);

  camera = new THREE.PerspectiveCamera(CAMERA.fov, (window.innerWidth / window.innerHeight) || 16 / 9, 0.5, 500);

  addLights();
  addTable();

  window.addEventListener('resize', onResize);
}

function addLights() {
  // Luz de ambiente: cielo calido arriba, rebote oscuro abajo
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2a2f45, 0.9));

  // Luz principal con sombras (como una lampara sobre la mesa)
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(12, 30, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = Math.max(TABLE.width, TABLE.depth) * 0.7;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 80 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // Luz de relleno suave desde el otro lado
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.35);
  fill.position.set(-15, 10, -10);
  scene.add(fill);
}

/**
 * Mesa: tablero + 4 bordes. Usa las mismas medidas que las colisiones de
 * sim/table.js (la fisica no se crea aqui: la crea la simulacion).
 */
function addTable() {
  const wood = getWoodTexture();
  const topMat = new THREE.MeshStandardMaterial({ map: wood, color: 0xc89060, roughness: 0.75 });
  const rimMat = new THREE.MeshStandardMaterial({ map: wood, color: 0x8a5a34, roughness: 0.7 });

  // Tablero (cara de arriba en y = 0) y bordes
  for (const { part, half, position } of tableParts()) {
    addBlock(half, position, part === 'top' ? topMat : rimMat, part === 'rim');
  }

  // Piso lejano para recibir sombra y dar sensacion de profundidad (sin fisica)
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(150, 48),
    new THREE.MeshStandardMaterial({ color: 0x262b3f, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -12;
  floor.receiveShadow = true;
  scene.add(floor);
}

function addBlock(half, pos, material, castShadow) {
  const geo = applyBoxUV(new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2), 0.08);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(pos.x, pos.y, pos.z);
  mesh.receiveShadow = true;
  mesh.castShadow = castShadow;
  scene.add(mesh);
}

let mat = null;

/**
 * Cambia el tapete del tablero que esta sobre la mesa (null = ninguno).
 * @param {THREE.Mesh|null} mesh
 */
export function setBoardMat(mesh) {
  if (mat) {
    scene.remove(mat);
    mat.geometry.dispose();
    mat.material.dispose(); // la textura se conserva en cache para la proxima vez
  }
  mat = mesh;
  if (mat) scene.add(mat);
}

function onResize() {
  // Una ventana minimizada u oculta puede medir 0: no dejar la camara con NaN
  if (!window.innerWidth || !window.innerHeight) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

export function renderScene() {
  renderer.render(scene, camera);
}
