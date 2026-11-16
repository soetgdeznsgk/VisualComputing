// ============================================================
// pieceViews.js — Lo que se VE de cada pieza (mallas de Three.js)
// ============================================================
// La posicion real de las piezas la decide la simulacion (en este
// navegador o en el servidor). Aqui solo se guardan sus mallas y se
// actualiza su posicion/rotacion para dibujarlas.
//
// Cada vista: { id, type, def, color, mesh, heldBy }
//   heldBy: id del jugador que la sostiene (0 = nadie)
// ============================================================

import * as THREE from 'three';
import { scene } from './scene.js';
import { pieceById, pieceGeometry } from './pieceCatalog.js';
import { getWoodTexture } from './woodTexture.js';
import { getDieTextures } from './diceTextures.js';

const HOVER_GLOW = new THREE.Color(0x6a4416); // brillo al pasar el cursor
const NO_GLOW = new THREE.Color(0x000000);

/** @type {Map<number, object>} */
const views = new Map();

/** Material segun el tipo de pieza (cada pieza tiene el suyo para poder resaltarla). */
function createMaterial(def, color) {
  switch (def.material) {
    case 'die':
      return getDieTextures().map((map) => new THREE.MeshStandardMaterial({ map, roughness: 0.4 }));
    case 'plastic':
      return new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.05 });
    default:
      return new THREE.MeshStandardMaterial({ map: getWoodTexture(), color, roughness: 0.6 });
  }
}

const asArray = (m) => (Array.isArray(m) ? m : [m]);

/**
 * Crea la vista de una pieza.
 * @param {{id:number, type:string, color:string, p?:number[], q?:number[], h?:number}} data
 */
export function createView(data) {
  removeView(data.id);
  const def = pieceById(data.type);
  const mesh = new THREE.Mesh(pieceGeometry(data.type), createMaterial(def, new THREE.Color(data.color)));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const view = { id: data.id, type: data.type, def, color: data.color, mesh, heldBy: data.h ?? 0 };
  mesh.userData.pieceId = data.id;
  if (data.p) mesh.position.fromArray(data.p);
  if (data.q) mesh.quaternion.fromArray(data.q);
  scene.add(mesh);
  views.set(data.id, view);
  return view;
}

/** Elimina la vista de una pieza. */
export function removeView(id) {
  const view = views.get(id);
  if (!view) return;
  scene.remove(view.mesh);
  // La geometria y las texturas se comparten entre piezas del mismo tipo:
  // solo se liberan los materiales, que son propios de cada pieza.
  asArray(view.mesh.material).forEach((m) => m.dispose());
  views.delete(id);
}

/** Elimina todas las vistas. */
export function clearViews() {
  [...views.keys()].forEach(removeView);
}

/** Vuelve a crear todas las vistas desde una lista completa de piezas. */
export function resetViews(list) {
  clearViews();
  list.forEach(createView);
}

export function getView(id) {
  return views.get(id) ?? null;
}

export function hasView(view) {
  return !!view && views.get(view.id) === view;
}

export function allViews() {
  return [...views.values()];
}

/** Mallas de todas las piezas (para el raycast). */
export function viewMeshes() {
  return allViews().map((v) => v.mesh);
}

/** Busca la vista a la que pertenece una malla. */
export function viewFromMesh(mesh) {
  return views.get(mesh.userData.pieceId) ?? null;
}

/**
 * Brillo de una pieza: calido si el cursor esta encima, del color del
 * jugador si otro la sostiene, o ninguno.
 * @param {object} view
 * @param {THREE.Color|null} glow
 */
export function setGlow(view, glow) {
  if (!view) return;
  asArray(view.mesh.material).forEach((m) => m.emissive.copy(glow ?? NO_GLOW));
}

export function setHoverGlow(view, on) {
  setGlow(view, on ? HOVER_GLOW : null);
}
