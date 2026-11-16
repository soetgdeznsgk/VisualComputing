// ============================================================
// snapPreview.js — Anillo que muestra donde caera una pieza
// ============================================================
// Mientras se sostiene una pieza que se imanta (fichas, piezas de
// ajedrez...), un anillo blanco sobre la mesa marca la casilla en la que
// se acomodaria al soltarla. Usa la misma regla que la simulacion
// (nearestSnapPoint en sim/snapping.js), asi lo que se ve es lo que pasa.
// ============================================================

import * as THREE from 'three';
import { SNAP } from './config.js';
import { scene } from './scene.js';
import { nearestSnapPoint } from './sim/snapping.js';
import { getBoard } from './boards/index.js';

let marker = null;

function getMarker() {
  if (!marker) {
    marker = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.46, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.renderOrder = 1;
    marker.visible = false;
    scene.add(marker);
  }
  return marker;
}

/**
 * Muestra el anillo en la casilla donde caeria la pieza sostenida.
 * @param {object|null} view — vista de la pieza sostenida (null = ocultar)
 * @param {string} boardId — tablero actual
 */
export function updateSnapPreview(view, boardId) {
  const m = getMarker();
  const snap = getBoard(boardId).snap;
  const pos = view?.mesh.position;
  const point = view?.def.snappable && snap && pos.y < SNAP.maxHeight ? nearestSnapPoint(snap, pos.x, pos.z) : null;
  m.visible = !!point;
  if (point) {
    m.position.set(point.x, 0.03, point.z);
    m.scale.setScalar(snap.cell);
  }
}

export function hideSnapPreview() {
  if (marker) marker.visible = false;
}
