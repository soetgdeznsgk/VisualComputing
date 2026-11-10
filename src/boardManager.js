// ============================================================
// boardManager.js — Cargar y cambiar de tablero
// ============================================================
// Al cargar un tablero:
//   1. Se limpian las piezas de la mesa.
//   2. Se cambia el tapete (dibujo del tablero) sobre la mesa.
//   3. Se configuran sus casillas imantadas.
//   4. Se ponen sus piezas iniciales.
//   5. La camara va a la vista de inicio de ese tablero.
// ============================================================

import { scene } from './scene.js';
import { getBoard } from './boards/index.js';
import { clearPieces, spawnPiece } from './pieces.js';
import { setSnapPoints } from './snapping.js';
import { resetDice } from './dice.js';

/** Tablero actual (lo leen app.js y ui.js). */
export const boardState = { current: null };

let mat = null;

function setMat(mesh) {
  if (mat) {
    scene.remove(mat);
    mat.geometry.dispose();
    mat.material.dispose(); // la textura se conserva en cache para la proxima vez
  }
  mat = mesh;
  if (mat) scene.add(mat);
}

/**
 * Carga un tablero por id ('free', 'parques', ...).
 * @param {string} id
 * @param {import('./cameraRig.js').CameraRig} rig
 * @returns {object} la definicion del tablero cargado
 */
export function loadBoard(id, rig) {
  const board = getBoard(id);

  clearPieces();
  setMat(board.createMat ? board.createMat() : null);
  setSnapPoints(board.snapPoints, board.cell);
  for (const s of board.setup()) {
    spawnPiece(s.type, s.color, s.position ? s : null);
  }
  resetDice();
  rig.setHome(board.camera);

  boardState.current = board;
  return board;
}
