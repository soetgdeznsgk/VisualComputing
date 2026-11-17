// ============================================================
// sim/table.js — Colisiones de la mesa (tablero + 4 bordes)
// ============================================================
// Solo la parte fisica. El dibujo de la mesa esta en scene.js y usa las
// mismas medidas (TABLE en config.js).
// ============================================================

import { TABLE } from '../config.js';
import { addStaticBox } from './physics.js';

/**
 * Cajas que forman la mesa: el tablero (cara de arriba en y = 0) y los
 * bordes que evitan que las piezas se caigan. scene.js las dibuja.
 * @returns {Array<{half:{x,y,z}, position:{x,y,z}, part:'top'|'rim'}>}
 */
export function tableParts() {
  const { width: W, depth: D, thickness: T, rimHeight: RH, rimWidth: RW } = TABLE;
  const y = RH / 2;
  return [
    { part: 'top', half: { x: W / 2, y: T / 2, z: D / 2 }, position: { x: 0, y: -T / 2, z: 0 } },
    { part: 'rim', half: { x: W / 2 + RW, y: RH / 2, z: RW / 2 }, position: { x: 0, y, z: D / 2 + RW / 2 } },
    { part: 'rim', half: { x: W / 2 + RW, y: RH / 2, z: RW / 2 }, position: { x: 0, y, z: -D / 2 - RW / 2 } },
    { part: 'rim', half: { x: RW / 2, y: RH / 2, z: D / 2 }, position: { x: W / 2 + RW / 2, y, z: 0 } },
    { part: 'rim', half: { x: RW / 2, y: RH / 2, z: D / 2 }, position: { x: -W / 2 - RW / 2, y, z: 0 } },
  ];
}

let created = false;

/** Agrega las colisiones de la mesa al mundo fisico (una sola vez). */
export function createTableBodies() {
  if (created) return;
  created = true;
  tableParts().forEach(({ half, position }) => addStaticBox(half, position));
}
