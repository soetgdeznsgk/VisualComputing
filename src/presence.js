// ============================================================
// presence.js — Cursores de los otros jugadores (multijugador)
// ============================================================
// Cada jugador conectado se ve en la mesa como un marcador de su color
// con su nombre encima, en el punto que esta apuntando. Asi se sabe que
// esta haciendo cada uno.
// ============================================================

import * as THREE from 'three';
import { scene } from './scene.js';

/** playerId -> { group, color, name } */
const markers = new Map();

/** Etiqueta con el nombre (sprite que siempre mira a la camara). */
function makeLabel(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '600 30px system-ui, sans-serif';
  const w = Math.min(248, ctx.measureText(name).width + 28);
  ctx.fillStyle = 'rgba(20, 24, 38, 0.85)';
  ctx.beginPath();
  ctx.roundRect((256 - w) / 2, 8, w, 48, 24);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 33);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(4, 1, 1);
  sprite.position.y = 1.8;
  sprite.renderOrder = 2;
  return sprite;
}

function makeMarker(player) {
  const group = new THREE.Group();
  const color = new THREE.Color(player.color);
  // Punta que senala hacia abajo + aro en la mesa
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 0.7, 16),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 }),
  );
  cone.rotation.x = Math.PI;
  cone.position.y = 0.6;
  group.add(cone);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.5, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);
  group.add(makeLabel(player.name, player.color));
  scene.add(group);
  return { group, color: player.color, name: player.name };
}

function removeMarker(id) {
  const m = markers.get(id);
  if (!m) return;
  scene.remove(m.group);
  m.group.traverse((o) => {
    o.geometry?.dispose();
    o.material?.map?.dispose();
    o.material?.dispose();
  });
  markers.delete(id);
}

/**
 * Actualiza los cursores de los demas jugadores.
 * @param {Object<string, number[]|null>} cursors — playerId -> [x, y, z]
 * @param {Array<{id, name, color}>} players
 * @param {number|null} myId — el propio no se dibuja (ya se ve el anillo de la mano)
 */
export function updatePresence(cursors, players, myId) {
  const seen = new Set();
  for (const player of players) {
    const p = cursors[player.id];
    if (player.id === myId || !p) continue;
    seen.add(player.id);
    let m = markers.get(player.id);
    if (m && (m.name !== player.name || m.color !== player.color)) {
      removeMarker(player.id);
      m = null;
    }
    if (!m) {
      m = makeMarker(player);
      m.target = new THREE.Vector3().fromArray(p);
      m.group.position.copy(m.target);
      markers.set(player.id, m);
    }
    m.target.fromArray(p);
  }
  for (const id of [...markers.keys()]) if (!seen.has(id)) removeMarker(id);
}

/**
 * Llamar cada frame: los cursores llegan 20 veces por segundo, asi que
 * cada marcador se desliza suavemente hacia su ultima posicion.
 */
export function animatePresence(dt) {
  const k = 1 - Math.exp(-15 * dt);
  for (const m of markers.values()) m.group.position.lerp(m.target, k);
}

/** Quita todos los cursores (al salir del multijugador). */
export function clearPresence() {
  [...markers.keys()].forEach(removeMarker);
}
