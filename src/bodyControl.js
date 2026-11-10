// ============================================================
// bodyControl.js — Llevar un cuerpo fisico a una pose objetivo
// ============================================================
// En vez de teletransportar una pieza (lo que la haria atravesar a las
// demas), se le da la velocidad necesaria para llegar a la posicion y
// rotacion objetivo. Es un controlador proporcional:
//
//   velocidad        = (objetivo - posicion) * ganancia
//   velocidad angular = eje * angulo_que_falta * ganancia
//
// Lo usan interaction.js (pieza agarrada) y snapping.js (ficha que se
// desliza al centro de una casilla).
// ============================================================

import * as THREE from 'three';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const qCurrentInv = new THREE.Quaternion();
const qError = new THREE.Quaternion();

/**
 * Ajusta la velocidad de `body` para acercarlo a la pose objetivo.
 * Llamar en cada sub-paso de la fisica (evento preStep).
 * @param {import('cannon-es').Body} body
 * @param {{x,y,z}} target — posicion objetivo
 * @param {THREE.Quaternion} targetQuat — rotacion objetivo
 * @param {{positionGain:number, maxSpeed:number, rotationGain:number}} gains
 * @returns {{distance:number, angle:number}} cuanto falta (para saber si ya llego)
 */
export function driveBody(body, target, targetQuat, { positionGain, maxSpeed, rotationGain }) {
  body.wakeUp();

  // --- Posicion ---
  const dx = target.x - body.position.x;
  const dy = target.y - body.position.y;
  const dz = target.z - body.position.z;
  const distance = Math.hypot(dx, dy, dz);
  let k = positionGain;
  if (distance * k > maxSpeed) k = maxSpeed / distance;
  body.velocity.set(dx * k, dy * k, dz * k);

  // --- Rotacion: error = objetivo * actual^-1, convertido a eje-angulo ---
  const q = body.quaternion;
  qCurrentInv.set(q.x, q.y, q.z, q.w).invert();
  qError.copy(targetQuat).multiply(qCurrentInv);
  if (qError.w < 0) qError.set(-qError.x, -qError.y, -qError.z, -qError.w); // camino mas corto
  const angle = 2 * Math.acos(clamp(qError.w, -1, 1));
  const s = Math.sqrt(1 - qError.w * qError.w);
  if (angle < 1e-3 || s < 1e-6) {
    body.angularVelocity.set(0, 0, 0);
  } else {
    const w = (angle * rotationGain) / s;
    body.angularVelocity.set(qError.x * w, qError.y * w, qError.z * w);
  }

  return { distance, angle };
}
