// ============================================================
// boards/gridTextures.js — Dibujo de tableros de cuadricula
// ============================================================
// Tablero de ajedrez/damas (8 x 8 con coordenadas a-h / 1-8) y tablero
// de triki (3 x 3). Se dibujan en un <canvas> y se usan como textura del
// tapete. Solo navegador: el servidor nunca llama estas funciones.
// ============================================================

import * as THREE from 'three';

/** Vetas suaves de madera sobre un rectangulo ya pintado. */
function grain(ctx, x, y, w, h, seed, alpha = 0.08) {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let i = 0; i < 14; i++) {
    const yy = y + rand() * h;
    ctx.strokeStyle = `rgba(60, 35, 15, ${alpha * (0.4 + rand())})`;
    ctx.lineWidth = 1 + rand() * 3;
    ctx.beginPath();
    for (let xx = x; xx <= x + w; xx += 12) {
      const off = Math.sin((xx / w) * Math.PI * 2 + i) * 3;
      if (xx === x) ctx.moveTo(xx, yy + off);
      else ctx.lineTo(xx, yy + off);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function toTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

let chessTex = null;

/**
 * Tablero 8 x 8 con marco y coordenadas. El borde ocupa `border` casillas
 * a cada lado (el tapete debe medir (8 + 2 * border) casillas).
 * La casilla a1 (abajo a la izquierda, del lado de las blancas) es oscura.
 */
export function getCheckerboardTexture(border = 0.6) {
  if (chessTex) return chessTex;
  const cells = 8 + border * 2;
  const SIZE = 2048;
  const C = SIZE / cells;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  // Marco de madera oscura
  ctx.fillStyle = '#4a2f1e';
  ctx.fillRect(0, 0, SIZE, SIZE);
  grain(ctx, 0, 0, SIZE, SIZE, 3, 0.15);

  const o = border * C;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const dark = (row + col) % 2 === 1;
      ctx.fillStyle = dark ? '#8a5a34' : '#e8cfa0';
      const x = o + col * C, y = o + row * C;
      ctx.fillRect(x, y, C, C);
      grain(ctx, x, y, C, C, 11 + row * 8 + col, dark ? 0.12 : 0.07);
    }
  }
  ctx.strokeStyle = '#2b1a10';
  ctx.lineWidth = 6;
  ctx.strokeRect(o, o, 8 * C, 8 * C);

  // Coordenadas: letras abajo/arriba, numeros a los lados (1 cerca de las blancas)
  ctx.fillStyle = '#e8cfa0';
  ctx.font = `600 ${C * 0.32}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let k = 0; k < 8; k++) {
    const letter = 'abcdefgh'[k];
    const number = String(8 - k);
    ctx.fillText(letter, o + (k + 0.5) * C, SIZE - o / 2);
    ctx.fillText(letter, o + (k + 0.5) * C, o / 2);
    ctx.fillText(number, o / 2, o + (k + 0.5) * C);
    ctx.fillText(number, SIZE - o / 2, o + (k + 0.5) * C);
  }

  chessTex = toTexture(canvas);
  return chessTex;
}

let ticTex = null;

/** Tablero de triki: madera clara con las 4 lineas del gato. */
export function getTicTacToeTexture(border = 0.15) {
  if (ticTex) return ticTex;
  const cells = 3 + border * 2;
  const SIZE = 1024;
  const C = SIZE / cells;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f1e2c4';
  ctx.fillRect(0, 0, SIZE, SIZE);
  grain(ctx, 0, 0, SIZE, SIZE, 5, 0.1);

  const o = border * C;
  ctx.strokeStyle = '#5a3a24';
  ctx.lineCap = 'round';
  ctx.lineWidth = C * 0.08;
  for (let k = 1; k <= 2; k++) {
    ctx.beginPath();
    ctx.moveTo(o + k * C, o + C * 0.1);
    ctx.lineTo(o + k * C, o + 3 * C - C * 0.1);
    ctx.moveTo(o + C * 0.1, o + k * C);
    ctx.lineTo(o + 3 * C - C * 0.1, o + k * C);
    ctx.stroke();
  }
  // Marco
  ctx.lineWidth = C * 0.05;
  ctx.strokeStyle = '#8a5a34';
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, SIZE - ctx.lineWidth, SIZE - ctx.lineWidth);

  ticTex = toTexture(canvas);
  return ticTex;
}
