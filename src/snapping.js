// ============================================================
// snapping.js — Casillas imantadas
// ============================================================
// Cada tablero puede definir "puntos de anclaje" (el centro de cada
// casilla). Al soltar una pieza marcada como `snappable` (las fichas)
// cerca de uno de esos puntos:
//
//   1. Se busca el punto mas cercano dentro de SNAP.radius casillas.
//   2. Si la casilla ya tiene fichas, todas se reparten en las esquinas
//      de la casilla (hasta 4) para que no se monten unas sobre otras.
//   3. La ficha se desliza al centro de su puesto y se endereza, usando
//      el mismo controlador por velocidad que la mano (bodyControl.js).
//
// Mientras se sostiene una ficha, un anillo en la mesa muestra la
// casilla donde caeria.
// ============================================================

import * as THREE from 'three';
import { SNAP } from './config.js';
import { scene } from './scene.js';
import { onPreStep } from './physics.js';
import { pieces } from './pieces.js';
import { driveBody } from './bodyControl.js';

/** @type {Array<{x:number, z:number}>} puntos del tablero actual */
let points = [];
let cell = 1;            // tamano de una casilla del tablero actual

/** Fichas que se estan deslizando a su puesto: pieza -> { pos, quat } */
const snapping = new Map();

const UPRIGHT = new THREE.Quaternion(); // identidad = de pie
const SNAP_TIMEOUT_MS = 1500;           // tiempo maximo deslizandose
let marker = null;

/**
 * Cambia los puntos de anclaje (lo llama boardManager al cargar un tablero).
 * @param {Array<{x:number,z:number}>} list
 * @param {number} cellSize — tamano de una casilla en unidades de la escena
 */
export function setSnapPoints(list, cellSize) {
  points = list;
  cell = cellSize;
  snapping.clear();
  hideSnapPreview();
}

const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Punto de anclaje mas cercano a (x, z), o null si ninguno esta en rango. */
function nearestPoint(x, z) {
  let best = null;
  let bestD = SNAP.radius * cell;
  for (const p of points) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

/** Donde esta (o va a quedar) una pieza: su objetivo si se esta deslizando. */
function restingSpot(piece) {
  return snapping.get(piece)?.pos ?? piece.body.position;
}

/** Fichas apoyadas en la casilla de `point` (sin contar `exclude`). */
function piecesInCell(point, exclude) {
  return pieces.filter((p) => p !== exclude
    && p.def.snappable
    && restingSpot(p).y < 3
    && dist2D(restingSpot(p), point) < cell * 0.5);
}

function startSnap(piece, x, z) {
  snapping.set(piece, {
    pos: new THREE.Vector3(x, piece.def.restHeight ?? 0.5, z),
    quat: UPRIGHT,
    start: performance.now(),
  });
}

/**
 * Intenta acomodar una pieza recien soltada en la casilla mas cercana.
 * @returns {boolean} si se va a acomodar
 */
export function trySnap(piece) {
  if (!piece.def.snappable || points.length === 0) return false;
  const pos = piece.body.position;
  if (pos.y > SNAP.maxHeight) return false;
  const point = nearestPoint(pos.x, pos.z);
  if (!point) return false;

  const others = piecesInCell(point, piece);
  if (others.length === 0) {
    startSnap(piece, point.x, point.z);
  } else {
    // Repartir todas las fichas de la casilla en sus esquinas
    const o = SNAP.slotOffset * cell;
    const slots = [[-o, -o], [o, o], [o, -o], [-o, o]];
    [...others, piece].forEach((p, i) => {
      const [dx, dz] = slots[i % slots.length];
      startSnap(p, point.x + dx, point.z + dz);
    });
  }
  return true;
}

/** Deja de acomodar una pieza (por ejemplo, porque alguien la agarro). */
export function cancelSnap(piece) {
  snapping.delete(piece);
}

// ------------------------------------------------------------
// Anillo de vista previa
// ------------------------------------------------------------

function getMarker() {
  if (!marker) {
    marker = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.46, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.renderOrder = 1;
    marker.visible = false;
    scene.add(marker);
  }
  return marker;
}

/** Muestra el anillo en la casilla donde caeria la pieza sostenida. */
export function updateSnapPreview(piece) {
  const m = getMarker();
  const pos = piece?.body.position;
  const point = piece?.def.snappable && pos.y < SNAP.maxHeight ? nearestPoint(pos.x, pos.z) : null;
  m.visible = !!point;
  if (point) {
    m.position.set(point.x, 0.03, point.z);
    m.scale.setScalar(cell);
  }
}

export function hideSnapPreview() {
  if (marker) marker.visible = false;
}

// ------------------------------------------------------------
// Deslizar las fichas a su puesto (en cada sub-paso de la fisica)
// ------------------------------------------------------------

onPreStep(() => {
  for (const [piece, t] of snapping) {
    if (!pieces.includes(piece)) {
      snapping.delete(piece);
      continue;
    }
    const { distance, angle } = driveBody(piece.body, t.pos, t.quat, {
      positionGain: SNAP.gain,
      maxSpeed: SNAP.maxSpeed,
      rotationGain: 10,
    });
    // Ya llego (o lleva demasiado intentandolo): fijarla exacta y quieta.
    // El margen no puede ser cero: la gravedad la hunde un poco en cada paso.
    if ((distance < 0.04 && angle < 0.03) || performance.now() - t.start > SNAP_TIMEOUT_MS) {
      const b = piece.body;
      b.position.set(t.pos.x, t.pos.y, t.pos.z);
      b.quaternion.set(t.quat.x, t.quat.y, t.quat.z, t.quat.w);
      b.velocity.set(0, 0, 0);
      b.angularVelocity.set(0, 0, 0);
      snapping.delete(piece);
    }
  }
});
