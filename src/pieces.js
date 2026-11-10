// ============================================================
// pieces.js — Piezas vivas en la mesa
// ============================================================
// Crea, elimina y sincroniza las piezas. Cada pieza une:
//   - mesh: lo que se ve (Three.js)
//   - body: lo que choca y cae (cannon-es)
// Cada frame se copia la posicion/rotacion del body al mesh.
//
// El estado de la mesa se puede exportar con serializeTable(): es la
// base para sincronizarla por red en la entrega del multijugador.
// ============================================================

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { scene } from './scene.js';
import { world, woodMaterial } from './physics.js';
import { buildPiece, resolveColor } from './pieceCatalog.js';
import { getWoodTexture } from './woodTexture.js';
import { getDieTextures } from './dice.js';
import { PHYSICS, TABLE } from './config.js';

const DENSITY = 0.15;              // masa por unidad de volumen
const HIGHLIGHT = new THREE.Color(0x6a4416); // brillo al pasar el cursor
const NO_HIGHLIGHT = new THREE.Color(0x000000);

/**
 * @typedef {object} Piece
 * @property {number} id
 * @property {string} type   — id del catalogo
 * @property {object} def    — definicion del catalogo (flags como snappable)
 * @property {string} color  — hex
 * @property {THREE.Mesh} mesh
 * @property {CANNON.Body} body
 * @property {{position:{x,y,z}, rotationY:number}|null} home — a donde vuelve si se cae
 */

/** @type {Piece[]} */
export const pieces = [];
let nextId = 1;

/** Material segun el tipo de pieza (cada pieza tiene el suyo para poder resaltarla). */
function createMaterial(def, color) {
  switch (def.material) {
    case 'die':
      return getDieTextures().map((map) => new THREE.MeshStandardMaterial({ map, roughness: 0.4 }));
    case 'plastic':
      return new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.05 });
    default:
      return new THREE.MeshStandardMaterial({ map: getWoodTexture(), color, roughness: 0.65 });
  }
}

const asArray = (m) => (Array.isArray(m) ? m : [m]);

/**
 * Pone una pieza nueva sobre la mesa.
 * @param {string} type — id del catalogo ('cube', 'pawn', 'die', ...)
 * @param {string} color — id de COLORS ('mix' = al azar) o un hex
 * @param {object} [placement] — si se omite, cae desde arriba en un punto al azar
 * @param {{x,y,z}} placement.position
 * @param {number} [placement.rotationY] — giro en Y (rad)
 * @param {boolean} [placement.home] — si se cae de la mesa, vuelve a este punto
 * @returns {Piece|null} la pieza, o null si se llego al limite
 */
export function spawnPiece(type, color, placement = null) {
  if (pieces.length >= PHYSICS.maxPieces) return null;

  const built = buildPiece(type);
  const hex = resolveColor(color);

  const mesh = new THREE.Mesh(built.geometry, createMaterial(built.def, new THREE.Color(hex)));
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const body = new CANNON.Body({
    mass: Math.max(0.2, built.volume * DENSITY),
    material: woodMaterial,
    linearDamping: 0.05,
    angularDamping: 0.1,
    sleepSpeedLimit: 0.25,
    sleepTimeLimit: 0.6,
  });
  built.shapes.forEach(({ shape, offset }) => body.addShape(shape, offset));

  if (placement) {
    const { x, y, z } = placement.position;
    body.position.set(x, y, z);
    body.quaternion.setFromEuler(0, placement.rotationY ?? 0, 0);
  } else {
    // Cae en un punto al azar cerca del centro, con un giro aleatorio en Y
    const spread = 0.35;
    body.position.set(
      (Math.random() - 0.5) * TABLE.width * spread,
      6 + built.size + Math.random() * 2,
      (Math.random() - 0.5) * TABLE.depth * spread,
    );
    body.quaternion.setFromEuler(0, Math.random() * Math.PI * 2, 0);
  }

  const piece = {
    id: nextId++,
    type,
    def: built.def,
    color: hex,
    mesh,
    body,
    home: placement?.home ? { position: { ...placement.position }, rotationY: placement.rotationY ?? 0 } : null,
  };
  mesh.userData.pieceId = piece.id;
  body.userData = { pieceId: piece.id };

  scene.add(mesh);
  world.addBody(body);
  pieces.push(piece);
  syncPiece(piece);
  return piece;
}

/** Elimina una pieza de la escena y del mundo fisico. */
export function removePiece(piece) {
  const i = pieces.indexOf(piece);
  if (i === -1) return;
  pieces.splice(i, 1);
  scene.remove(piece.mesh);
  world.removeBody(piece.body);
  // La geometria y las texturas se comparten entre piezas del mismo tipo:
  // solo se liberan los materiales, que son propios de cada pieza.
  asArray(piece.mesh.material).forEach((m) => m.dispose());
}

/** Elimina todas las piezas. */
export function clearPieces() {
  [...pieces].forEach(removePiece);
}

/** Busca la pieza a la que pertenece una malla (para el raycast). */
export function pieceFromMesh(mesh) {
  return pieces.find((p) => p.mesh === mesh) ?? null;
}

/** Mallas de todas las piezas (para el raycast). */
export function pieceMeshes() {
  return pieces.map((p) => p.mesh);
}

/** Resalta (o no) una pieza: brillo calido en el material. */
export function setHighlight(piece, on) {
  if (!piece) return;
  asArray(piece.mesh.material).forEach((m) => m.emissive.copy(on ? HIGHLIGHT : NO_HIGHLIGHT));
}

function syncPiece(p) {
  p.mesh.position.copy(p.body.position);
  p.mesh.quaternion.copy(p.body.quaternion);
}

/** Devuelve una pieza a su punto de inicio, quieta. */
function sendHome(p) {
  const { x, y, z } = p.home.position;
  p.body.position.set(x, y + 1, z);
  p.body.quaternion.setFromEuler(0, p.home.rotationY, 0);
  p.body.velocity.set(0, 0, 0);
  p.body.angularVelocity.set(0, 0, 0);
  p.body.wakeUp();
}

/**
 * Llamar cada frame despues de la fisica: copia body -> mesh. Las piezas
 * que caen fuera de la mesa vuelven a su punto de inicio (fichas y dados)
 * o se eliminan (bloques).
 * @returns {number} cuantas piezas se eliminaron por caer
 */
export function syncPieces() {
  let fallen = 0;
  for (const p of [...pieces]) {
    if (p.body.position.y < PHYSICS.fallLimitY) {
      if (p.home) {
        sendHome(p);
      } else {
        removePiece(p);
        fallen++;
        continue;
      }
    }
    syncPiece(p);
  }
  return fallen;
}

/**
 * Estado de la mesa como datos simples (JSON). Servira para enviarlo por
 * red en el modo multijugador.
 */
export function serializeTable() {
  const r = (v) => Math.round(v * 1000) / 1000;
  return pieces.map((p) => ({
    id: p.id,
    type: p.type,
    color: p.color,
    position: [r(p.body.position.x), r(p.body.position.y), r(p.body.position.z)],
    quaternion: [r(p.body.quaternion.x), r(p.body.quaternion.y), r(p.body.quaternion.z), r(p.body.quaternion.w)],
  }));
}
