// ============================================================
// boards/matTextures.js — Tapete de cada tablero (solo navegador)
// ============================================================
// Las definiciones de tableros (boards/*.js) son datos que tambien usa el
// servidor, asi que solo dicen el NOMBRE de su textura. Aqui se traduce
// ese nombre al dibujo real y se crea la malla del tapete.
// ============================================================

import * as THREE from 'three';
import { getParquesTexture } from './parquesTexture.js';
import { getCheckerboardTexture, getTicTacToeTexture } from './gridTextures.js';

const TEXTURES = {
  parques: () => getParquesTexture(),
  checkerboard: (mat) => getCheckerboardTexture(mat.border),
  tictactoe: (mat) => getTicTacToeTexture(mat.border),
};

/**
 * Crea el tapete de un tablero: un plano apoyado sobre la mesa.
 * @param {{size:number, texture:string, border?:number}|null} mat
 * @returns {THREE.Mesh|null}
 */
export function createMatMesh(mat) {
  if (!mat) return null;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(mat.size, mat.size),
    new THREE.MeshStandardMaterial({ map: TEXTURES[mat.texture](mat), roughness: 0.6 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.005; // apenas encima de la mesa para que no parpadee
  mesh.receiveShadow = true;
  return mesh;
}
