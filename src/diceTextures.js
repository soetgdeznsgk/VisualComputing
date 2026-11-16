// ============================================================
// diceTextures.js — Texturas de las caras del dado (solo navegador)
// ============================================================
// Cada cara es un <canvas> con sus puntos. El orden de las caras y su
// valor estan en sim/diceLogic.js (FACE_VALUES), que es tambien lo que
// usa la simulacion para leer el resultado.
// ============================================================

import * as THREE from 'three';
import { FACE_VALUES } from './sim/diceLogic.js';

// Posicion de los puntos en una cara de 3x3 (0..2 en cada eje)
const PIPS = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

let textures = null;

/** Texturas de las 6 caras (se crean una vez y se comparten entre dados). */
export function getDieTextures() {
  if (textures) return textures;
  textures = FACE_VALUES.map((value) => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fbf8f2';
    ctx.fillRect(0, 0, size, size);
    // Borde suave para que se note la arista
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, size - 10, size - 10);
    // El 1 va en rojo y mas grande, como en los dados tradicionales
    ctx.fillStyle = value === 1 ? '#c8322b' : '#23201c';
    const r = value === 1 ? 30 : 22;
    for (const [cx, cy] of PIPS[value]) {
      ctx.beginPath();
      ctx.arc(64 + cx * 64, 64 + cy * 64, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  });
  return textures;
}
