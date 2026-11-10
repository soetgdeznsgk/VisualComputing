// ============================================================
// boards/parques.js — Tablero de parques (4 colores)
// ============================================================
// No programa las reglas: pone el tablero, las 16 fichas en sus carceles
// y 2 dados, y los jugadores mueven las fichas a mano. Las casillas son
// imantadas: una ficha soltada cerca de una casilla se acomoda sola.
// ============================================================

import * as THREE from 'three';
import { BOARD_SIZE, CELL, PLAYERS, JAIL_SLOTS, gridToWorld, snapPoints } from './parquesLayout.js';
import { getParquesTexture } from './parquesTexture.js';
import { pieceById } from '../pieceCatalog.js';

/** Centro de la zona de los dados: a la derecha del tablero, sobre la mesa. */
const DICE_ZONE = { x: 13, z: 0 };

export const parques = {
  id: 'parques',
  name: 'Parqués',
  ui: { buildPalette: false, trash: false, dice: true },
  camera: { radius: 30, phi: 0.62, theta: 0, targetY: 0 },
  cell: CELL,
  diceZone: DICE_ZONE,
  snapPoints: snapPoints(),

  /** Tapete con el dibujo del tablero, apoyado sobre la mesa. */
  createMat() {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_SIZE, BOARD_SIZE),
      new THREE.MeshStandardMaterial({ map: getParquesTexture(), roughness: 0.6 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.005; // apenas encima de la mesa para que no parpadee
    mesh.receiveShadow = true;
    return mesh;
  },

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
