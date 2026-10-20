// ============================================================
// PERSONA 2 — Interpretacion de gestos y mapeo 3D
// ============================================================
// Responsabilidades:
//   - Leer handData de handTracker.js
//   - Mapear landmarks a coordenadas 3D del volumen de dibujo
//   - Detectar gestos (pintar, pausar, limpiar, cambiar color)
//   - Exponer pose y gesto actual para app.js
//
// Reemplaza a controllerPose() de base.jsx: en vez de una curva
// simulada, la pose sale de la mano real.
//
// Gestos:
//   - Mano abierta              -> 'paint'
//   - Puno cerrado              -> 'idle'  (dejar de pintar)
//   - Pellizco (pulgar+indice)  -> 'colorChange' (un solo frame al empezar)
//   - Senal de V sostenida      -> 'clear' (un solo frame tras CLEAR_HOLD_MS)
//   - Sin mano                  -> 'idle'
//
// NO tocar: handTracker.js ni ui.js
// ============================================================

import { handData } from './handTracker.js';

// Landmarks clave de MediaPipe Hands:
// 0  = munieca
// 4  = punta pulgar
// 8  = punta indice  <-- puntero principal
// 12 = punta medio
// 16 = punta anular
// 20 = punta menique

const BOX = 130; // tamano del volumen de dibujo (mismo que base.jsx)

// --- Calibracion ---
const PINCH_IN = 0.35;      // dist(pulgar, indice) / escala para entrar en pellizco
const PINCH_OUT = 0.5;      // ... y para salir (histeresis, evita rebotes)
const EXTEND_RATIO = 1.1;   // punta debe estar 10% mas lejos que la articulacion
const STABLE_FRAMES = 4;    // frames seguidos para aceptar un gesto
const CLEAR_HOLD_MS = 800;  // tiempo sosteniendo la V para limpiar
const SMOOTH = 0.35;        // peso de la muestra nueva en el suavizado (0..1)
const S_FAR = 0.08;         // tamano aparente de la mano lejos de la camara
const S_NEAR = 0.28;        // ... y cerca de la camara
const Y_RANGE = BOX * 1.6;  // altura del volumen sobre la grilla

const COLORS = [
  [0.0, 0.8, 0.9],  // cyan
  [1.0, 0.5, 0.0],  // naranja
  [0.2, 0.9, 0.2],  // verde
  [0.9, 0.2, 0.6],  // rosa
  [0.3, 0.4, 1.0],  // azul
];

let colorIndex = 0;

/**
 * Estado compartido — app.js lee de aqui cada frame.
 */
export const poseData = {
  position: { x: 0, y: 0, z: 0 },
  direction: { x: 0, y: 0, z: 1 },
  gesture: 'idle',            // 'paint' | 'idle' | 'clear' | 'colorChange'
  color: [...COLORS[0]],
};

// --- Utilidades geometricas ---

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

/**
 * Tamano aparente de la mano: munieca (0) -> nudillo del medio (9), en 2D.
 * Sirve para normalizar distancias y para estimar profundidad.
 */
export function handScale(lm) {
  return Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 1e-6;
}

/**
 * Un dedo esta extendido si su punta esta mas lejos de la munieca que su
 * articulacion PIP. No depende de la orientacion de la mano.
 */
function fingerExtended(lm, tip, pip) {
  return dist(lm[0], lm[tip]) > dist(lm[0], lm[pip]) * EXTEND_RATIO;
}

/**
 * El pulgar se compara contra el nudillo del menique (17): extendido, la
 * punta queda lejos; doblado sobre la palma, queda cerca.
 */
function thumbExtended(lm) {
  return dist(lm[4], lm[17]) > dist(lm[3], lm[17]) * EXTEND_RATIO;
}

/**
 * Clasifica la pose cruda de un frame.
 * @param {Array<{x,y,z}>} lm — 21 landmarks
 * @param {boolean} wasPinching — si ya se estaba pellizcando (histeresis)
 * @returns {'pinch'|'v'|'open'|'fist'|null} null si la pose es ambigua
 */
export function classifyGesture(lm, wasPinching = false) {
  const scale = handScale(lm);
  const pinchT = wasPinching ? PINCH_OUT : PINCH_IN;
  if (dist(lm[4], lm[8]) / scale < pinchT) return 'pinch';

  const index = fingerExtended(lm, 8, 6);
  const middle = fingerExtended(lm, 12, 10);
  const ring = fingerExtended(lm, 16, 14);
  const pinky = fingerExtended(lm, 20, 18);
  const thumb = thumbExtended(lm);
  const count = [thumb, index, middle, ring, pinky].filter(Boolean).length;

  if (count >= 4) return 'open';
  if (index && middle && !ring && !pinky) return 'v';
  if (!index && !middle && !ring && !pinky) return 'fist';
  return null;
}

// --- Estado temporal ---

let stablePose = 'fist';  // ultima pose aceptada
let candidate = null;     // pose que esta intentando estabilizarse
let candidateFrames = 0;
let vStart = 0;           // cuando empezo la V
let cleared = false;      // ya se emitio 'clear' en esta V
let tracking = false;     // habia mano el frame anterior

function resetTracking() {
  tracking = false;
  stablePose = 'fist';
  candidate = null;
  candidateFrames = 0;
  cleared = false;
}

/**
 * Llamar cada frame. Lee handData y actualiza poseData.
 */
export function updateGesture() {
  if (!handData.detected || handData.landmarks.length < 21) {
    resetTracking();
    poseData.gesture = 'idle';
    return;
  }

  const lm = handData.landmarks;
  const now = performance.now();

  // --- MAPEO 3D ---
  // x se invierte para coincidir con el video en espejo; y queda sobre la
  // grilla; z sale del tamano aparente (mano mas grande = mas cerca = +z).
  const tip = lm[8];
  const depth = clamp((handScale(lm) - S_FAR) / (S_NEAR - S_FAR), 0, 1);
  const tx = clamp((0.5 - tip.x) * BOX * 2, -BOX, BOX);
  const ty = clamp((1 - tip.y) * Y_RANGE, 0, Y_RANGE);
  const tz = (depth * 2 - 1) * BOX;

  // Direccion: del nudillo (5) a la punta (8), en el mismo espacio
  const base = lm[5];
  let dx = base.x - tip.x;
  let dy = base.y - tip.y;
  let dz = base.z - tip.z; // z de MediaPipe negativo = hacia la camara
  const mag = Math.hypot(dx, dy, dz) || 1;
  dx /= mag; dy /= mag; dz /= mag;

  // Suavizado exponencial; al reaparecer la mano se salta directo
  const k = tracking ? SMOOTH : 1;
  const p = poseData.position, d = poseData.direction;
  p.x += (tx - p.x) * k;
  p.y += (ty - p.y) * k;
  p.z += (tz - p.z) * k;
  d.x += (dx - d.x) * k;
  d.y += (dy - d.y) * k;
  d.z += (dz - d.z) * k;
  const dm = Math.hypot(d.x, d.y, d.z) || 1;
  d.x /= dm; d.y /= dm; d.z /= dm;
  tracking = true;

  // --- DETECCION DE GESTOS ---
  const raw = classifyGesture(lm, stablePose === 'pinch') ?? stablePose;
  if (raw === candidate) candidateFrames++;
  else { candidate = raw; candidateFrames = 1; }

  let entered = false;
  if (candidateFrames >= STABLE_FRAMES && candidate !== stablePose) {
    stablePose = candidate;
    entered = true;
  }

  switch (stablePose) {
    case 'open':
      poseData.gesture = 'paint';
      break;
    case 'pinch':
      // Flanco: un solo cambio de color por pellizco
      if (entered) nextColor();
      poseData.gesture = entered ? 'colorChange' : 'idle';
      break;
    case 'v':
      if (entered) { vStart = now; cleared = false; }
      if (!cleared && now - vStart >= CLEAR_HOLD_MS) {
        cleared = true;
        poseData.gesture = 'clear';
      } else {
        poseData.gesture = 'idle';
      }
      break;
    default: // 'fist'
      poseData.gesture = 'idle';
  }
  poseData.color = [...COLORS[colorIndex]];
}

/**
 * Cambia al siguiente color de la paleta.
 */
export function nextColor() {
  colorIndex = (colorIndex + 1) % COLORS.length;
  poseData.color = [...COLORS[colorIndex]];
}
