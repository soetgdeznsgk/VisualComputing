// ============================================================
// sim/snapping.js — Casillas imantadas (logica, sin dibujo)
// ============================================================
// Cada tablero define "puntos de anclaje" (el centro de cada casilla) y
// un MODO que dice que pasa si la casilla ya esta ocupada:
//
//   'spread'  (parques) las fichas se reparten en las esquinas (hasta 4)
//   'stack'   (damas)   la ficha se apila encima (para coronar)
//   'capture' (ajedrez) la pieza rival se va a la zona de capturadas;
//                       si es del mismo color, no se acomoda
//   'single'  (triki)   si esta ocupada, no se acomoda
//
// Al acomodarse, la pieza se desliza al punto con el mismo controlador
// por velocidad que usa la mano (bodyControl.js), queda derecha y con su
// giro redondeado a 90 grados (el caballo mira a un lado del tablero).
//
// El anillo que muestra la casilla mientras se sostiene una pieza es
// visual y esta en snapPreview.js (solo navegador).
// ============================================================

import * as THREE from 'three';
import { SNAP } from '../config.js';
import { driveBody } from './bodyControl.js';

const SNAP_TIMEOUT_MS = 1500; // tiempo maximo deslizandose
const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const forward = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

/** Rotacion "de pie" con el giro en Y de la pieza redondeado a 90 grados. */
function uprightQuat(body) {
  const b = body.quaternion;
  tmpQ.set(b.x, b.y, b.z, b.w);
  forward.set(0, 0, 1).applyQuaternion(tmpQ);
  const yaw = Math.atan2(forward.x, forward.z);
  const snapped = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), snapped);
}

/**
 * Busca el punto de anclaje mas cercano. Exportada para que el navegador
 * muestre el anillo de vista previa con exactamente la misma regla.
 * @param {{points:Array<{x,z}>, cell:number}} snap
 * @returns {{x:number,z:number}|null}
 */
export function nearestSnapPoint(snap, x, z) {
  if (!snap) return null;
  let best = null;
  let bestD = SNAP.radius * snap.cell;
  for (const p of snap.points) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

export class Snapper {
  /**
   * @param {object} sim — la Simulation dueña de las piezas
   */
  constructor(sim) {
    this.sim = sim;
    this.snap = null;
    /** Piezas deslizandose a su puesto: id -> { pos, quat, start } */
    this.active = new Map();
  }

  /**
   * Configura las casillas del tablero actual.
   * @param {{points, cell, mode, captureSlots?}|null} snap
   */
  configure(snap) {
    this.snap = snap?.points?.length ? snap : null;
    this.active.clear();
  }

  cancel(id) {
    this.active.delete(id);
  }

  /** Donde esta (o va a quedar) una pieza: su objetivo si se esta deslizando. */
  spotOf(piece) {
    return this.active.get(piece.id)?.pos ?? piece.body.position;
  }

  /** Piezas apoyadas en la casilla de `point` (sin contar `exclude` ni las sostenidas). */
  piecesInCell(point, exclude) {
    const out = [];
    for (const p of this.sim.pieces.values()) {
      if (p === exclude || !p.def.snappable || this.sim.heldBy(p.id)) continue;
      const spot = this.spotOf(p);
      if (spot.y < 4 && dist2D(spot, point) < this.snap.cell * 0.5) out.push(p);
    }
    return out;
  }

  /** Lleva una pieza a (x, y, z), de pie. */
  start(piece, x, y, z) {
    this.active.set(piece.id, {
      pos: new THREE.Vector3(x, y, z),
      quat: uprightQuat(piece.body),
      start: performance.now(),
    });
  }

  rest(piece) {
    return piece.def.restHeight ?? 0.5;
  }

  /** Primer puesto libre de la zona de capturadas de un color. */
  freeCaptureSlot(color) {
    const slots = this.snap.captureSlots?.[color] ?? [];
    return slots.find((s) => ![...this.sim.pieces.values()].some((p) => dist2D(this.spotOf(p), s) < 0.6)) ?? null;
  }

  /**
   * Intenta acomodar una pieza recien soltada en la casilla mas cercana.
   * @returns {boolean} si se va a acomodar
   */
  trySnap(piece) {
    if (!this.snap || !piece.def.snappable) return false;
    const pos = piece.body.position;
    if (pos.y > SNAP.maxHeight) return false;
    const point = nearestSnapPoint(this.snap, pos.x, pos.z);
    if (!point) return false;

    const others = this.piecesInCell(point, piece);
    const rest = this.rest(piece);

    if (others.length === 0) {
      this.start(piece, point.x, rest, point.z);
      return true;
    }

    switch (this.snap.mode) {
      case 'spread': {
        // Repartir todas las fichas de la casilla en sus esquinas
        const o = SNAP.slotOffset * this.snap.cell;
        const slots = [[-o, -o], [o, o], [o, -o], [-o, o]];
        [...others, piece].forEach((p, i) => {
          const [dx, dz] = slots[i % slots.length];
          this.start(p, point.x + dx, this.rest(p), point.z + dz);
        });
        return true;
      }
      case 'stack': {
        // Encima de las que ya hay (damas coronadas)
        const h = piece.def.stackHeight ?? 0.3;
        this.start(piece, point.x, rest + others.length * h, point.z);
        return true;
      }
      case 'capture': {
        // Solo se captura una pieza del otro color
        if (others.some((o) => o.color === piece.color)) return false;
        for (const o of others) {
          const slot = this.freeCaptureSlot(o.color);
          if (slot) this.start(o, slot.x, this.rest(o), slot.z);
        }
        this.start(piece, point.x, rest, point.z);
        return true;
      }
      default: // 'single'
        return false;
    }
  }

  /** Desliza las piezas a su puesto. Llamar en cada sub-paso de la fisica. */
  drive() {
    for (const [id, t] of this.active) {
      const piece = this.sim.pieces.get(id);
      if (!piece) {
        this.active.delete(id);
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
        this.active.delete(id);
      }
    }
  }
}
