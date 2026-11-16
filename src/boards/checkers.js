// ============================================================
// boards/checkers.js — Damas
// ============================================================
// Mismo tablero 8 x 8 del ajedrez, 12 fichas por jugador en las casillas
// oscuras de sus 3 primeras filas.
//
// Casillas imantadas en modo 'stack': soltar una ficha sobre otra la
// apila encima (asi se corona una dama). Las fichas capturadas se sacan
// del tablero a mano.
// ============================================================

import { gridLayout } from './gridLayout.js';
import { pieceById } from '../pieceCatalog.js';
import { WHITE, BLACK } from './chess.js';

const BORDER = 0.6;
const layout = gridLayout(8, 2);

export const checkers = {
  id: 'checkers',
  name: 'Damas',
  ui: { buildPalette: false, trash: false, dice: false },
  camera: { radius: 28, phi: 0.7, theta: 0, targetY: 0 },
  mat: { size: (8 + BORDER * 2) * layout.cell, texture: 'checkerboard', border: BORDER },
  snap: { points: layout.points, cell: layout.cell, mode: 'stack' },

  setup() {
    const rest = pieceById('checker').restHeight;
    const pieces = [];
    for (let row = 0; row < 8; row++) {
      if (row > 2 && row < 5) continue; // las dos filas del medio empiezan vacias
      for (let col = 0; col < 8; col++) {
        if ((row + col) % 2 === 0) continue; // solo casillas oscuras
        const { x, z } = layout.cellToWorld(col, row);
        pieces.push({
          type: 'checker',
          color: row < 3 ? BLACK : WHITE,
          position: { x, y: rest + 0.02, z },
          home: true,
        });
      }
    }
    return pieces;
  },
};
