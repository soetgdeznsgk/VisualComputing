// ============================================================
// PERSONA 2 — Interpretacion de gestos y mapeo 3D
// ============================================================
// Responsabilidades:
//   - Leer handData de handTracker.js
//   - Mapear landmarks a coordenadas 3D del volumen de dibujo
//   - Detectar gestos (pintar, pausar, limpiar, cambiar color)
//   - Exponer pose y gesto actual para app.js
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

/**
 * Llamar cada frame. Lee handData y actualiza poseData.
 *
 * TODO Persona 2:
 *   1. Tomar landmarks[8] (punta del indice) y mapearlo al volumen 3D
 *      - x: (landmark.x - 0.5) * BOX * 2  (centrar y escalar)
 *      - y: (1 - landmark.y - 0.5) * BOX * 2  (invertir Y)
 *      - z: landmark.z * BOX * escala  (profundidad)
 *   2. Calcular direction como vector del landmark 5 al 8
 *   3. Detectar gestos:
 *      - Indice extendido, demas cerrados -> 'paint'
 *      - Mano abierta -> 'idle'
 *      - Puno cerrado -> 'clear'
 *      - Pulgar + indice juntos (pellizco) -> 'colorChange'
 *   4. Actualizar poseData
 */
export function updateGesture() {
  if (!handData.detected || handData.landmarks.length === 0) {
    poseData.gesture = 'idle';
    return;
  }

  const lm = handData.landmarks;

  // --- MAPEO BASICO (mejorar) ---
  const tip = lm[8]; // punta del indice
  poseData.position.x = (tip.x - 0.5) * BOX * 2;
  poseData.position.y = (1 - tip.y - 0.5) * BOX * 2;
  poseData.position.z = tip.z * BOX * 10;

  // Direccion: del nudillo (5) a la punta (8)
  const base = lm[5];
  const dx = tip.x - base.x;
  const dy = tip.y - base.y;
  const dz = tip.z - base.z;
  const mag = Math.hypot(dx, dy, dz) || 1;
  poseData.direction.x = dx / mag;
  poseData.direction.y = -dy / mag;
  poseData.direction.z = dz / mag;

  // --- DETECCION DE GESTOS (placeholder) ---
  // TODO Persona 2: implementar deteccion real
  // Por ahora siempre pinta
  poseData.gesture = 'paint';
  poseData.color = [...COLORS[colorIndex % COLORS.length]];
}

/**
 * Cambia al siguiente color de la paleta.
 */
export function nextColor() {
  colorIndex = (colorIndex + 1) % COLORS.length;
  poseData.color = [...COLORS[colorIndex]];
}
