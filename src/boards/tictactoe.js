// ============================================================
// boards/tictactoe.js — Triki (tres en linea)
// ============================================================
// Tablero 3 x 3, cinco X a la izquierda y cinco O a la derecha.
// Casillas imantadas en modo 'single': una sola pieza por casilla; si la
// casilla ya esta ocupada, la pieza no se acomoda.
// ============================================================

import { gridLayout } from './gridLayout.js';
import { pieceById } from '../pieceCatalog.js';

const BORDER = 0.15;
const layout = gridLayout(3, 3.6);

export const X_COLOR = '#d9473b';
export const O_COLOR = '#3a78c9';

export const tictactoe = {
  id: 'tictactoe',
  name: 'Triki',
  ui: { buildPalette: false, trash: false, dice: false },
  camera: { radius: 25, phi: 0.75, theta: 0, targetY: 0 },
  mat: { size: (3 + BORDER * 2) * layout.cell, texture: 'tictactoe', border: BORDER },
  snap: { points: layout.points, cell: layout.cell, mode: 'single' },

  setup() {
    const pieces = [];
    for (let k = 0; k < 5; k++) {
      const z = (k - 2) * 2.7;
      pieces.push({ type: 'ticX', color: X_COLOR, position: { x: -10, y: pieceById('ticX').restHeight + 0.02, z }, home: true });
      pieces.push({ type: 'ticO', color: O_COLOR, position: { x: 10, y: pieceById('ticO').restHeight + 0.02, z }, home: true });
    }
    return pieces;
  },
};
