// ============================================================
// dice.js — Dados: texturas, lectura del resultado y lanzamiento
// ============================================================
// - Cada cara del dado es una textura dibujada en un canvas (los puntos).
// - El resultado se lee de la ROTACION del cuerpo fisico: se mira cual de
//   los 6 ejes locales del cubo apunta mas hacia arriba en el mundo.
// - Un dado "esta rodando" si se mueve rapido; cuando todos los dados
//   quedan quietos un momento, se reporta el resultado una sola vez.
// ============================================================

import * as THREE from 'three';
import { DICE } from './config.js';
import { pieces } from './pieces.js';

// Valor de cada cara, en el orden de materiales de THREE.BoxGeometry:
// +X, -X, +Y, -Y, +Z, -Z. Las caras opuestas suman 7, como en un dado real.
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const FACE_AXES = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];

// Posicion de los puntos en una cara de 3x3 (0..2 en cada eje)
const PIPS = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

let textures = null;

/** Texturas de las 6 caras (se crean una vez y se comparten entre dados). */
export function getDieTextures() {
  if (textures) return textures;
  textures = FACE_VALUES.map((value) => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fbf8f2';
    ctx.fillRect(0, 0, size, size);
    // Borde suave para que se note la arista
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, size - 10, size - 10);
    // El 1 va en rojo y mas grande, como en los dados tradicionales
    ctx.fillStyle = value === 1 ? '#c8322b' : '#23201c';
    const r = value === 1 ? 30 : 22;
    for (const [cx, cy] of PIPS[value]) {
      ctx.beginPath();
      ctx.arc(64 + cx * 64, 64 + cy * 64, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  });
  return textures;
}

const q = new THREE.Quaternion();
const axis = new THREE.Vector3();

/**
 * Lee la cara que mira hacia arriba de un dado.
 * @returns {{value:number, flat:boolean}} valor 1..6 y si esta bien apoyado
 *   (flat = false si quedo inclinado, por ejemplo contra el borde de la mesa)
 */
export function readDie(piece) {
  const b = piece.body.quaternion;
  q.set(b.x, b.y, b.z, b.w);
  let best = 0;
  let bestY = -Infinity;
  FACE_AXES.forEach((a, i) => {
    const y = axis.copy(a).applyQuaternion(q).y;
    if (y > bestY) { bestY = y; best = i; }
  });
  // cos(15 grados) ~ 0.966: mas inclinado que eso no cuenta como apoyado
  return { value: FACE_VALUES[best], flat: bestY > 0.966 };
}

// --- Deteccion de "termino de rodar" ---

const stillSince = new Map(); // pieza -> momento en que quedo quieta
let pending = false;          // algun dado rodo y falta reportar
let ignoreUntil = 0;          // no detectar tiradas antes de este momento

/**
 * Olvida el estado de los dados. Se llama al cargar un tablero: al aparecer,
 * los dados se acomodan un poco y eso no debe contar como una tirada.
 */
export function resetDice() {
  stillSince.clear();
  pending = false;
  ignoreUntil = performance.now() + 1200;
}

/**
 * Llamar cada frame. Devuelve el resultado UNA vez cuando todos los dados
 * terminan de rodar; el resto del tiempo devuelve null.
 * @param {object|null} held — pieza agarrada (un dado en la mano no cuenta como quieto)
 * @returns {{values:number[], total:number, doubles:boolean, cocked:boolean}|null}
 *   cocked = algun dado quedo inclinado (hay que volver a lanzar)
 */
export function updateDice(held) {
  const dice = pieces.filter((p) => p.type === 'die');
  if (dice.length === 0) {
    pending = false;
    return null;
  }
  const now = performance.now();
  if (now < ignoreUntil) return null;
  for (const d of dice) {
    const speed = d.body.velocity.length();
    const spin = d.body.angularVelocity.length();
    if (d === held || speed > DICE.rollingSpeed) {
      pending = true;
      stillSince.delete(d);
    } else if (speed < DICE.stillSpeed && spin < DICE.stillSpin) {
      if (!stillSince.has(d)) stillSince.set(d, now);
    } else {
      stillSince.delete(d);
    }
  }

  const allSettled = dice.every((d) => d !== held && now - (stillSince.get(d) ?? now) >= DICE.settleMs);
  if (!pending || !allSettled) return null;

  pending = false;
  const reads = dice.map(readDie);
  const values = reads.map((r) => r.value);
  return {
    values,
    total: values.reduce((a, b) => a + b, 0),
    doubles: values.length === 2 && values[0] === values[1],
    cocked: reads.some((r) => !r.flat),
  };
}

/**
 * Lanza todos los dados que nadie sostiene: los sube sobre su zona con
 * un giro y velocidad al azar, y la fisica hace el resto.
 * @param {{x:number, z:number}} zone — centro de la zona de dados del tablero
 * @param {object|null} held
 */
export function rollDice(zone, held) {
  const dice = pieces.filter((p) => p.type === 'die' && p !== held);
  dice.forEach((d, i) => {
    const b = d.body;
    const rand = (a) => (Math.random() * 2 - 1) * a;
    b.position.set(zone.x + rand(0.5), 5 + i * 1.6, zone.z + (i - (dice.length - 1) / 2) * 2.2);
    b.quaternion.setFromEuler(rand(Math.PI), rand(Math.PI), rand(Math.PI));
    b.velocity.set(rand(1.2), 2, rand(1.5));
    b.angularVelocity.set(rand(14), rand(14), rand(14));
    b.wakeUp();
  });
  pending = dice.length > 0;
}
