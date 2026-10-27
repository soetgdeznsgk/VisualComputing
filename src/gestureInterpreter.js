// ============================================================
// gestureInterpreter.js — De landmarks a gestos utiles
// ============================================================
// Lee los landmarks crudos de handTracker.js y, para cada mano, calcula:
//   - pose estable: 'open' | 'fist' | 'pinch' | 'point' | 'v' | 'none'
//   - cursor: punto medio entre pulgar e indice, en coordenadas de pantalla 0..1
//   - palm:   centro de la palma, en coordenadas de pantalla 0..1
//   - depth:  que tan cerca esta la mano de la camara (log del tamano de la palma)
//   - roll:   giro de la muneca en el plano de la imagen (radianes)
//
// Todo va suavizado para quitar el temblor natural de la deteccion.
// La clasificacion de poses parte del trabajo de Juan Sebastian Gamez
// (Persona 2), extendida con la pose 'point'.
//
// Quien usa esto:
//   - interaction.js (mano derecha: agarrar y mover piezas)
//   - cameraRig.js   (mano izquierda: girar y hacer zoom)
//   - ui.js          (indicadores en pantalla)
// ============================================================

import { hands } from './handTracker.js';
import { GESTURE } from './config.js';

// --- Utilidades geometricas ---

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Lleva un angulo al rango (-PI, PI]. */
export function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * Tamano aparente de la palma: promedio del triangulo
 * muneca (0) - nudillo indice (5) - nudillo menique (17), en 2D.
 * Crece cuando la mano se acerca a la camara. Usar tres lados lo hace
 * menos sensible a inclinar la mano que una sola distancia.
 */
export function palmSize(lm) {
  const s = (dist2D(lm[0], lm[5]) + dist2D(lm[0], lm[17]) + dist2D(lm[5], lm[17])) / 3;
  return s || 1e-6;
}

/** Un dedo esta extendido si su punta esta mas lejos de la muneca que su articulacion media. */
function fingerExtended(lm, tip, pip) {
  return dist(lm[0], lm[tip]) > dist(lm[0], lm[pip]) * GESTURE.extendRatio;
}

/** El pulgar se compara contra el nudillo del menique (17). */
function thumbExtended(lm) {
  return dist(lm[4], lm[17]) > dist(lm[3], lm[17]) * GESTURE.extendRatio;
}

/**
 * Clasifica la pose de un solo frame.
 * @param {Array<{x,y,z}>} lm — 21 landmarks
 * @param {boolean} wasPinching — si ya se estaba pellizcando (histeresis)
 * @returns {'pinch'|'open'|'fist'|'point'|'v'|null} null si es ambigua
 */
export function classifyPose(lm, wasPinching = false) {
  const pinchT = wasPinching ? GESTURE.pinchOut : GESTURE.pinchIn;
  if (dist2D(lm[4], lm[8]) / palmSize(lm) < pinchT) return 'pinch';

  const index = fingerExtended(lm, 8, 6);
  const middle = fingerExtended(lm, 12, 10);
  const ring = fingerExtended(lm, 16, 14);
  const pinky = fingerExtended(lm, 20, 18);
  const thumb = thumbExtended(lm);
  const count = [thumb, index, middle, ring, pinky].filter(Boolean).length;

  if (count >= 4) return 'open';
  if (index && middle && !ring && !pinky) return 'v';
  if (index && !middle && !ring && !pinky) return 'point';
  if (!index && !middle && !ring && !pinky) return 'fist';
  return null;
}

/** Estira la zona util de la imagen (GESTURE.activeArea) a 0..1. */
function toScreen(x, y) {
  const a = GESTURE.activeArea;
  return {
    x: clamp((x - a.minX) / (a.maxX - a.minX), 0, 1),
    y: clamp((y - a.minY) / (a.maxY - a.minY), 0, 1),
  };
}

/**
 * Estado de los gestos de una mano. Se actualiza una vez por frame.
 */
class HandGesture {
  constructor(side) {
    this.side = side;          // 'left' | 'right'
    this.detected = false;
    this.pose = 'none';        // pose estable actual
    this.poseChanged = false;  // true solo en el frame en que cambio la pose
    this.poseSince = 0;        // performance.now() cuando empezo la pose actual
    this.cursor = { x: 0.5, y: 0.5 }; // pulgar-indice, pantalla 0..1
    this.palm = { x: 0.5, y: 0.5 };   // centro de la palma, pantalla 0..1
    this.depth = 0;            // log(tamano de palma): mayor = mas cerca de la camara
    this.roll = 0;             // giro de la muneca (rad)
    this.landmarks = [];       // landmarks crudos (para dibujar el esqueleto)

    this._candidate = null;
    this._candidateFrames = 0;
  }

  _reset() {
    this.detected = false;
    this.poseChanged = this.pose !== 'none';
    this.pose = 'none';
    this.landmarks = [];
    this._candidate = null;
    this._candidateFrames = 0;
  }

  /** @param {{detected:boolean, landmarks:Array}} hand — de handTracker */
  update(hand, now) {
    if (!hand.detected || hand.landmarks.length < 21) {
      this._reset();
      return;
    }
    const lm = hand.landmarks;
    this.landmarks = lm;

    // --- Medidas continuas ---
    const pinchMid = { x: (lm[4].x + lm[8].x) / 2, y: (lm[4].y + lm[8].y) / 2 };
    const cursor = toScreen(pinchMid.x, pinchMid.y);
    const palmIdx = [0, 5, 9, 13, 17];
    const palm = toScreen(
      palmIdx.reduce((s, i) => s + lm[i].x, 0) / palmIdx.length,
      palmIdx.reduce((s, i) => s + lm[i].y, 0) / palmIdx.length,
    );
    const depth = Math.log(palmSize(lm));
    // Angulo de la linea nudillo indice (5) -> nudillo menique (17).
    const roll = Math.atan2(lm[17].y - lm[5].y, lm[17].x - lm[5].x);

    // Si la mano acaba de aparecer, saltar directo al valor (sin suavizar desde
    // una posicion vieja); si no, suavizado exponencial.
    const k = this.detected ? GESTURE.smoothing : 1;
    this.cursor.x += (cursor.x - this.cursor.x) * k;
    this.cursor.y += (cursor.y - this.cursor.y) * k;
    this.palm.x += (palm.x - this.palm.x) * k;
    this.palm.y += (palm.y - this.palm.y) * k;
    this.depth += (depth - this.depth) * k;
    // El angulo se suaviza por la diferencia envuelta, para no saltar en +-PI.
    this.roll = wrapAngle(this.roll + wrapAngle(roll - this.roll) * k);
    this.detected = true;

    // --- Pose con estabilidad: debe repetirse varios frames para aceptarse ---
    const raw = classifyPose(lm, this.pose === 'pinch') ?? this.pose;
    if (raw === this._candidate) this._candidateFrames++;
    else { this._candidate = raw; this._candidateFrames = 1; }

    this.poseChanged = false;
    if (this._candidateFrames >= GESTURE.stableFrames && this._candidate !== this.pose) {
      this.pose = this._candidate;
      this.poseChanged = true;
      this.poseSince = now;
    }
  }
}

/** Gestos actuales de cada mano. Leer despues de llamar updateGestures(). */
export const gestures = {
  left: new HandGesture('left'),
  right: new HandGesture('right'),
};

/** Llamar una vez por frame, antes de usar `gestures`. */
export function updateGestures() {
  const now = performance.now();
  gestures.left.update(hands.left, now);
  gestures.right.update(hands.right, now);
}
