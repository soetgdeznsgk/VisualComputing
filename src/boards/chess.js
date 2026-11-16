// ============================================================
// boards/chess.js — Ajedrez
// ============================================================
// Tablero 8 x 8 con las 32 piezas en su posicion inicial. Las blancas
// quedan del lado de la camara inicial (+Z).
//
// Casillas imantadas en modo 'capture': si sueltas una pieza en una
// casilla ocupada por una pieza RIVAL, la rival se va sola a la zona de
// capturadas (a un lado del tablero). Las reglas de movimiento las ponen
// los jugadores.
// ============================================================

import { gridLayout } from './gridLayout.js';
import { pieceById } from '../pieceCatalog.js';

export const WHITE = '#efe2c8';
export const BLACK = '#3a281d';

const BORDER = 0.6; // marco en casillas (coordenadas a-h / 1-8)
const layout = gridLayout(8, 2);
const BACK_RANK = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

/** Puestos de la zona de capturadas: 2 columnas x 8 filas a un lado del tablero. */
function captureSlots(side) {
  const slots = [];
  for (let col = 0; col < 2; col++) {
    for (let row = 0; row < 8; row++) {
      slots.push({ x: side * (11.2 + col * 2), z: -7 + row * 2 });
    }
  }
  return slots;
}

export const chess = {
  id: 'chess',
  name: 'Ajedrez',
  ui: { buildPalette: false, trash: false, dice: false },
  camera: { radius: 30, phi: 0.72, theta: 0, targetY: 0 },
  mat: { size: (8 + BORDER * 2) * layout.cell, texture: 'checkerboard', border: BORDER },
  snap: {
    points: layout.points,
    cell: layout.cell,
    mode: 'capture',
    captureSlots: { [WHITE]: captureSlots(-1), [BLACK]: captureSlots(1) },
  },

  setup() {
    const place = (type, color, col, row) => {
      const { x, z } = layout.cellToWorld(col, row);
      return {
        type,
        color,
        position: { x, y: pieceById(type).restHeight + 0.02, z },
        // Las negras miran hacia las blancas (importa para el caballo)
        rotationY: color === BLACK ? Math.PI : 0,
        home: true,
      };
    };
    const pieces = [];
    for (let col = 0; col < 8; col++) {
      pieces.push(place(BACK_RANK[col], BLACK, col, 0));
      pieces.push(place('chessPawn', BLACK, col, 1));
      pieces.push(place('chessPawn', WHITE, col, 6));
      pieces.push(place(BACK_RANK[col], WHITE, col, 7));
    }
    return pieces;
  },
};
