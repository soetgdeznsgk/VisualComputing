// ============================================================
// pieces.js — Piezas vivas en la mesa
// ============================================================
// Crea, elimina y sincroniza las piezas. Cada pieza une:
//   - mesh: lo que se ve (Three.js)
//   - body: lo que choca y cae (cannon-es)
// Cada frame se copia la posicion/rotacion del body al mesh.
// ============================================================

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { scene } from './scene.js';
import { world, woodMaterial } from './physics.js';
import { buildPiece, resolveColor } from './pieceCatalog.js';
import { getWoodTexture } from './woodTexture.js';
import { PHYSICS, TABLE } from './config.js';

const DENSITY = 0.15;              // masa por unidad de volumen
const HIGHLIGHT = new THREE.Color(0x6a4416); // brillo al pasar el cursor
const NO_HIGHLIGHT = new THREE.Color(0x000000);

/** @type {Array<{id:number, type:string, mesh:THREE.Mesh, body:CANNON.Body}>} */
export const pieces = [];
let nextId = 1;

/**
 * Pone una pieza nueva sobre la mesa, cayendo desde arriba.
 * @param {string} type — id del catalogo ('cube', 'arch', ...)
 * @param {string} colorId — id de COLORS ('mix' = al azar)
 * @returns {object|null} la pieza, o null si se llego al limite
 */
export function spawnPiece(type, colorId) {
  if (pieces.length >= PHYSICS.maxPieces) return null;

  const built = buildPiece(type);

  const material = new THREE.MeshStandardMaterial({
    map: getWoodTexture(),
    color: new THREE.Color(resolveColor(colorId)),
    roughness: 0.65,
  });
  const mesh = new THREE.Mesh(built.geometry, material);
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

  // Aparece en un punto al azar cerca del centro, un poco elevada y con un
  // pequeno giro aleatorio en Y para que no todas queden alineadas.
  const spread = 0.35;
  body.position.set(
    (Math.random() - 0.5) * TABLE.width * spread,
    6 + built.size + Math.random() * 2,
    (Math.random() - 0.5) * TABLE.depth * spread,
  );
  body.quaternion.setFromEuler(0, Math.random() * Math.PI * 2, 0);

  const piece = { id: nextId++, type, mesh, body };
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
  // La geometria es compartida entre piezas del mismo tipo: solo se
  // libera el material, que es propio de cada pieza.
  piece.mesh.material.dispose();
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
  piece.mesh.material.emissive.copy(on ? HIGHLIGHT : NO_HIGHLIGHT);
}

function syncPiece(p) {
  p.mesh.position.copy(p.body.position);
  p.mesh.quaternion.copy(p.body.quaternion);
}

/**
 * Llamar cada frame despues de la fisica: copia body -> mesh y elimina
 * las piezas que cayeron fuera de la mesa.
 * @returns {number} cuantas piezas se eliminaron por caer
 */
export function syncPieces() {
  let fallen = 0;
  for (const p of [...pieces]) {
    if (p.body.position.y < PHYSICS.fallLimitY) {
      removePiece(p);
      fallen++;
      continue;
    }
    syncPiece(p);
  }
  return fallen;
}
