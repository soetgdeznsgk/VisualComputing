// ============================================================
// boards/index.js — Registro de tableros
// ============================================================
// Un tablero es un objeto de DATOS (lo usan el navegador y el servidor):
//
//   {
//     id, name,
//     ui:      { buildPalette, trash, dice }    que paneles mostrar
//     camera:  { radius, phi, theta, targetY }  vista de inicio
//     mat:     { size, texture, border? }       tapete con el dibujo (null = sin tapete)
//     snap:    { points, cell, mode, captureSlots? }  casillas imantadas (null = ninguna)
//              mode: 'spread' | 'stack' | 'capture' | 'single' (ver sim/snapping.js)
//     diceZone:{ x, z }                         donde se lanzan los dados (opcional)
//     setup(): [{ type, color, position?, rotationY?, home? }]  piezas iniciales
//   }
//
// Para agregar un juego nuevo: crear su archivo en esta carpeta, anadirlo
// a BOARDS y, si tiene dibujo propio, su textura en matTextures.js. El
// selector de la interfaz lo muestra solo.
// ============================================================

import { freeBuild } from './freeBuild.js';
import { parques } from './parques.js';
import { chess } from './chess.js';
import { checkers } from './checkers.js';
import { tictactoe } from './tictactoe.js';

export const BOARDS = [freeBuild, parques, chess, checkers, tictactoe];

export function getBoard(id) {
  return BOARDS.find((b) => b.id === id) ?? BOARDS[0];
}
