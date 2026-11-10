// ============================================================
// boards/index.js — Registro de tableros
// ============================================================
// Un tablero es un objeto de DATOS con esta forma:
//
//   {
//     id, name,
//     ui:        { buildPalette, trash, dice }  que paneles mostrar
//     camera:    { radius, phi, theta, targetY } vista de inicio
//     cell:      tamano de una casilla (para las casillas imantadas)
//     snapPoints:[{x, z}] centros de las casillas imantadas
//     diceZone:  {x, z}  donde se lanzan los dados (opcional)
//     createMat(): THREE.Mesh | null   tapete con el dibujo del tablero
//     setup():   [{ type, color, position?, rotationY?, home? }] piezas iniciales
//   }
//
// Para agregar un juego nuevo: crear su archivo en esta carpeta y
// anadirlo a BOARDS. El selector de la interfaz lo muestra solo.
// ============================================================

import { freeBuild } from './freeBuild.js';
import { parques } from './parques.js';

export const BOARDS = [freeBuild, parques];

export function getBoard(id) {
  return BOARDS.find((b) => b.id === id) ?? BOARDS[0];
}
