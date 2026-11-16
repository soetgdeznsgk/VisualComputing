// ============================================================
// boards/parques.js — Tablero de parques (4 colores)
// ============================================================
// No programa las reglas: pone el tablero, las 16 fichas en sus carceles
// y 2 dados, y los jugadores mueven las fichas a mano. Las casillas son
// imantadas en modo 'spread': varias fichas en una casilla se reparten
// en sus esquinas.
// ============================================================

import { BOARD_SIZE, CELL, PLAYERS, JAIL_SLOTS, gridToWorld, snapPoints } from './parquesLayout.js';
import { pieceById } from '../pieceCatalog.js';

/** Centro de la zona de los dados: a la derecha del tablero, sobre la mesa. */
const DICE_ZONE = { x: 13, z: 0 };

export const parques = {
  id: 'parques',
  name: 'Parqués',
  ui: { buildPalette: false, trash: false, dice: true },
  camera: { radius: 30, phi: 0.62, theta: 0, targetY: 0 },
  mat: { size: BOARD_SIZE, texture: 'parques' },
  snap: { points: snapPoints(), cell: CELL, mode: 'spread' },
  diceZone: DICE_ZONE,

  /** Piezas iniciales: 4 fichas por color en su carcel y 2 dados. */
  setup() {
    const pawnHeight = pieceById('pawn').restHeight;
    const color = Object.fromEntries(PLAYERS.map((p) => [p.id, p.hex]));
    const pawns = JAIL_SLOTS.map((s) => {
      const { x, z } = gridToWorld(s.u, s.v);
      return { type: 'pawn', color: color[s.owner], position: { x, y: pawnHeight + 0.02, z }, home: true };
    });
    const dice = [-1.5, 1.5].map((dz) => ({
      type: 'die',
      color: '#ffffff',
      position: { x: DICE_ZONE.x, y: 0.75, z: DICE_ZONE.z + dz },
      rotationY: Math.random() * Math.PI,
      home: true,
    }));
    return [...pawns, ...dice];
  },
};
