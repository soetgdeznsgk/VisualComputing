// ============================================================
// sim/diceLogic.js — Leer y lanzar los dados (sin dibujo)
// ============================================================
// - El resultado se lee de la ROTACION del cuerpo fisico: se mira cual de
//   los 6 ejes locales del cubo apunta mas hacia arriba en el mundo.
// - Un dado "esta rodando" si se mueve rapido; cuando todos los dados
//   quedan quietos un momento, se reporta el resultado una sola vez.
// Las texturas de las caras estan en diceTextures.js (solo navegador).
// ============================================================

import * as THREE from 'three';
import { DICE } from '../config.js';

// Valor de cada cara, en el orden de materiales de THREE.BoxGeometry:
// +X, -X, +Y, -Y, +Z, -Z. Las caras opuestas suman 7, como en un dado real.
export const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const FACE_AXES = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];

const q = new THREE.Quaternion();
const axis = new THREE.Vector3();

/**
 * Lee la cara que mira hacia arriba de un dado.
 * @param {import('cannon-es').Body} body
 * @returns {{value:number, flat:boolean}} valor 1..6 y si esta bien apoyado
 *   (flat = false si quedo inclinado, por ejemplo contra el borde de la mesa)
 */
export function readDie(body) {
  const b = body.quaternion;
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

/**
 * Detecta cuando los dados terminan de rodar. Una instancia por mesa.
 */
export class DiceDetector {
  constructor() {
    this.stillSince = new Map(); // id del dado -> momento en que quedo quieto
    this.pending = false;        // algun dado rodo y falta reportar
    this.ignoreUntil = 0;        // no detectar tiradas antes de este momento
  }

  /**
   * Olvida el estado. Se llama al cargar un tablero: al aparecer, los dados
   * se acomodan un poco y eso no debe contar como una tirada.
   */
  reset() {
    this.stillSince.clear();
    this.pending = false;
    this.ignoreUntil = performance.now() + 1200;
  }

  /** Marca que hay una tirada en curso (boton "Lanzar dados"). */
  arm() {
    this.pending = true;
  }

  /**
   * Llamar en cada paso. Devuelve el resultado UNA vez cuando todos los
   * dados terminan de rodar; el resto del tiempo devuelve null.
   * @param {Array<{id:number, body:object}>} dice
   * @param {(id:number) => boolean} isHeld — si alguien sostiene ese dado
   * @returns {{values:number[], total:number, doubles:boolean, cocked:boolean}|null}
   *   cocked = algun dado quedo inclinado (hay que volver a lanzar)
   */
  update(dice, isHeld) {
    if (dice.length === 0) {
      this.pending = false;
      return null;
    }
    const now = performance.now();
    if (now < this.ignoreUntil) return null;

    for (const d of dice) {
      const speed = d.body.velocity.length();
      const spin = d.body.angularVelocity.length();
      if (isHeld(d.id) || speed > DICE.rollingSpeed) {
        this.pending = true;
        this.stillSince.delete(d.id);
      } else if (speed < DICE.stillSpeed && spin < DICE.stillSpin) {
        if (!this.stillSince.has(d.id)) this.stillSince.set(d.id, now);
      } else {
        this.stillSince.delete(d.id);
      }
    }

    const allSettled = dice.every((d) => !isHeld(d.id)
      && now - (this.stillSince.get(d.id) ?? now) >= DICE.settleMs);
    if (!this.pending || !allSettled) return null;

    this.pending = false;
    const reads = dice.map((d) => readDie(d.body));
    const values = reads.map((r) => r.value);
    return {
      values,
      total: values.reduce((a, b) => a + b, 0),
      doubles: values.length === 2 && values[0] === values[1],
      cocked: reads.some((r) => !r.flat),
    };
  }
}

/**
 * Lanza dados: los sube sobre su zona con un giro y velocidad al azar, y
 * la fisica hace el resto.
 * @param {Array<{body:object}>} dice — dados que nadie sostiene
 * @param {{x:number, z:number}} zone — centro de la zona de dados del tablero
 */
export function throwDice(dice, zone) {
  dice.forEach((d, i) => {
    const b = d.body;
    const rand = (a) => (Math.random() * 2 - 1) * a;
    b.position.set(zone.x + rand(0.5), 5 + i * 1.6, zone.z + (i - (dice.length - 1) / 2) * 2.2);
    b.quaternion.setFromEuler(rand(Math.PI), rand(Math.PI), rand(Math.PI));
    b.velocity.set(rand(1.2), 2, rand(1.5));
    b.angularVelocity.set(rand(14), rand(14), rand(14));
    b.wakeUp();
  });
}
