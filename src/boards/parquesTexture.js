// ============================================================
// boards/parquesTexture.js — Dibujo del tablero de parques
// ============================================================
// Dibuja el tablero en un <canvas> de 2048 px a partir de los datos de
// parquesLayout.js y lo convierte en textura. Asi el tablero se ve
// nitido, no depende de imagenes externas y siempre coincide con las
// casillas imantadas (salen de los mismos datos).
// ============================================================

import * as THREE from 'three';
import { GRID, PLAYERS, TRACK, HOME, JAIL_SLOTS, GOAL_SLOTS } from './parquesLayout.js';

const SIZE = 2048;
const C = SIZE / GRID; // pixeles por casilla

const INK = '#3d362e';
const PAPER = '#f4ecdc';
const SAFE_FILL = '#e3d8c3';

const color = Object.fromEntries(PLAYERS.map((p) => [p.id, p.hex]));

/** Mezcla un color con blanco (t = 0 color puro, 1 blanco). */
function tint(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * t);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function cellRect(ctx, i, j, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(i * C, j * C, C, C);
  ctx.strokeRect(i * C, j * C, C, C);
}

/** Estrella de 5 puntas (marca de seguro). */
function star(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function drawJails(ctx) {
  for (const p of PLAYERS) {
    const x0 = (p.jail.i - 4) * C;
    const y0 = (p.jail.j - 4) * C;
    roundRect(ctx, x0 + 0.3 * C, y0 + 0.3 * C, 7.4 * C, 7.4 * C, 0.7 * C);
    ctx.fillStyle = p.hex;
    ctx.fill();
    roundRect(ctx, x0 + 0.9 * C, y0 + 0.9 * C, 6.2 * C, 6.2 * C, 0.5 * C);
    ctx.fillStyle = tint(p.hex, 0.82);
    ctx.fill();

    ctx.fillStyle = INK;
    ctx.font = `700 ${0.5 * C}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`CÁRCEL ${p.name.toUpperCase()}`, p.jail.i * C, (p.jail.j + 2.65) * C);
  }
  // Puestos de las fichas
  for (const s of JAIL_SLOTS) {
    ctx.beginPath();
    ctx.arc(s.u * C, s.v * C, 0.55 * C, 0, Math.PI * 2);
    ctx.fillStyle = tint(color[s.owner], 0.45);
    ctx.fill();
    ctx.lineWidth = 0.06 * C;
    ctx.strokeStyle = color[s.owner];
    ctx.stroke();
  }
}

function drawTrack(ctx) {
  ctx.lineWidth = 0.045 * C;
  ctx.strokeStyle = INK;

  for (const c of TRACK) {
    const hex = color[c.owner];
    const cx = (c.i + 0.5) * C, cy = (c.j + 0.5) * C;
    if (c.kind === 'exit') {
      // Salida: casilla del color con un circulo blanco
      cellRect(ctx, c.i, c.j, hex);
      ctx.beginPath();
      ctx.arc(cx, cy, 0.28 * C, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    } else if (c.kind === 'safe') {
      cellRect(ctx, c.i, c.j, SAFE_FILL);
      star(ctx, cx, cy, 0.32 * C);
      ctx.fillStyle = INK;
      ctx.fill();
    } else if (c.kind === 'entry') {
      // Entrada a la llegada: flecha del color apuntando al cielo
      cellRect(ctx, c.i, c.j, '#ffffff');
      const toCenter = Math.atan2(9.5 - (c.j + 0.5), 9.5 - (c.i + 0.5));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(toCenter);
      ctx.beginPath();
      ctx.moveTo(0.3 * C, 0);
      ctx.lineTo(-0.2 * C, -0.25 * C);
      ctx.lineTo(-0.2 * C, 0.25 * C);
      ctx.closePath();
      ctx.fillStyle = hex;
      ctx.fill();
      ctx.restore();
    } else {
      cellRect(ctx, c.i, c.j, '#ffffff');
    }
  }

  // Llegadas: casillas del color, mas claras
  for (const c of HOME) cellRect(ctx, c.i, c.j, tint(color[c.owner], 0.35));
}

function drawGoal(ctx) {
  // Cuatro triangulos que se juntan en el centro del cuadro 8..11
  const a = 8 * C, b = 11 * C, m = 9.5 * C;
  const tri = {
    N: [[a, a], [b, a]],
    E: [[b, a], [b, b]],
    S: [[b, b], [a, b]],
    W: [[a, b], [a, a]],
  };
  ctx.lineWidth = 0.045 * C;
  ctx.strokeStyle = INK;
  for (const p of PLAYERS) {
    const [[x1, y1], [x2, y2]] = tri[p.arm];
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(m, m);
    ctx.closePath();
    ctx.fillStyle = p.hex;
    ctx.fill();
    ctx.stroke();
  }
  for (const s of GOAL_SLOTS) {
    ctx.beginPath();
    ctx.arc(s.u * C, s.v * C, 0.22 * C, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(m, m, 0.35 * C, 0, Math.PI * 2);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.stroke();
  star(ctx, m, m, 0.24 * C);
  ctx.fillStyle = INK;
  ctx.fill();
}

let cached = null;

/** Textura del tablero de parques (se dibuja una sola vez). */
export function getParquesTexture() {
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, SIZE, SIZE);

  drawJails(ctx);
  drawTrack(ctx);
  drawGoal(ctx);

  // Marco exterior
  ctx.lineWidth = 0.18 * C;
  ctx.strokeStyle = INK;
  ctx.strokeRect(0.09 * C, 0.09 * C, SIZE - 0.18 * C, SIZE - 0.18 * C);

  cached = new THREE.CanvasTexture(canvas);
  cached.colorSpace = THREE.SRGBColorSpace;
  cached.anisotropy = 8;
  return cached;
}
