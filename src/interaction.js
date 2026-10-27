// ============================================================
// interaction.js — Agarrar, mover, rotar y soltar piezas
// ============================================================
// Recibe una "intencion" de la mano derecha (o del raton) y la aplica
// a las piezas:
//
//   1. Apuntar: se lanza un rayo desde la camara hacia el cursor; la
//      primera pieza que toca queda resaltada.
//   2. Agarrar: al empezar el pellizco (o clic) sobre una pieza, se guarda
//      la distancia a la camara y el punto exacto donde se tomo.
//   3. Mover: la pieza sigue al rayo del cursor a esa distancia. Acercar
//      la mano a la camara (palma mas grande) la empuja hacia el fondo;
//      alejarla la trae hacia ti.
//   4. Rotar: girar la muneca gira la pieza alrededor del eje de la vista.
//   5. Soltar: la pieza conserva su velocidad (se puede lanzar) y la
//      fisica se encarga de que caiga y choque.
//
// La pieza agarrada NO se teletransporta: en cada paso de la fisica se le
// da la velocidad necesaria para llegar al objetivo. Asi sigue chocando
// con las demas piezas y las empuja en vez de atravesarlas.
// ============================================================

import * as THREE from 'three';
import { GRAB, TABLE } from './config.js';
import { onPreStep } from './physics.js';
import { pieces, pieceFromMesh, pieceMeshes, setHighlight, removePiece } from './pieces.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Intencion de control (la arman app.js desde la mano o desde el raton):
 * @typedef {object} PointerIntent
 * @property {boolean} active  — hay mano/raton controlando
 * @property {{x:number,y:number}} screen — cursor en pantalla, 0..1
 * @property {boolean} grab    — pellizco / boton presionado
 * @property {number} depth    — profundidad (unidades log; solo importa su cambio)
 * @property {number} roll     — giro acumulado (rad; solo importa su cambio)
 * @property {boolean} overUI  — el cursor esta sobre un panel de la interfaz
 */

/** Estado publico (lo lee la interfaz). */
export const interaction = {
  state: 'idle',   // 'idle' | 'hover' | 'holding'
  hovered: null,   // pieza bajo el cursor
  held: null,      // pieza agarrada
};

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let prevGrab = false;

// Ultima pieza apuntada (ver "agarre tolerante" en updateInteraction)
const STICKY_MS = 350;
let lastHit = null;

// Datos del agarre actual
const grab = {
  distance: 0,                  // distancia camara -> punto agarrado
  offset: new THREE.Vector3(),  // centro de la pieza - punto agarrado
  depthStart: 0,
  rollStart: 0,
  startQuat: new THREE.Quaternion(),  // rotacion de la pieza al agarrarla
  target: new THREE.Vector3(),        // donde deberia estar la pieza
  targetQuat: new THREE.Quaternion(), // como deberia estar rotada
};

// Temporales reutilizados (evita crear objetos cada frame)
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const forward = new THREE.Vector3();

function setHovered(piece) {
  if (interaction.hovered === piece) return;
  if (interaction.hovered !== interaction.held) setHighlight(interaction.hovered, false);
  interaction.hovered = piece;
  setHighlight(piece, true);
}

function startHold(piece, hitPoint, camera, intent) {
  interaction.held = piece;
  grab.distance = camera.position.distanceTo(hitPoint);
  grab.offset.copy(piece.body.position).sub(hitPoint);
  grab.depthStart = intent.depth;
  grab.rollStart = intent.roll;
  grab.startQuat.copy(piece.body.quaternion);
  grab.target.copy(piece.body.position);
  grab.targetQuat.copy(grab.startQuat);
  setHighlight(piece, true);
}

/**
 * Suelta la pieza agarrada.
 * @returns {object|null} la pieza soltada
 */
function release() {
  const piece = interaction.held;
  if (!piece) return null;
  const v = piece.body.velocity;
  const speed = v.length();
  // Limitar la velocidad de lanzamiento y frenar el giro para que no salga disparada
  if (speed > GRAB.maxThrowSpeed) v.scale(GRAB.maxThrowSpeed / speed, v);
  piece.body.angularVelocity.scale(0.3, piece.body.angularVelocity);
  interaction.held = null;
  setHighlight(piece, piece === interaction.hovered);
  return piece;
}

/**
 * Llamar una vez por frame (antes de la fisica).
 * @param {PointerIntent} intent
 * @param {THREE.PerspectiveCamera} camera
 * @param {(screen:{x,y}) => boolean} isOverTrash — si el cursor esta sobre la papelera
 * @returns {{trashed: boolean}} si en este frame se tiro una pieza a la papelera
 */
export function updateInteraction(intent, camera, isOverTrash) {
  const result = { trashed: false };

  // Si una pieza fue eliminada por otro lado (boton "Limpiar", cayo de la
  // mesa), olvidarla para no seguir moviendola.
  if (interaction.held && !pieces.includes(interaction.held)) interaction.held = null;
  if (interaction.hovered && !pieces.includes(interaction.hovered)) interaction.hovered = null;

  if (!intent.active) {
    if (interaction.held) release();
    setHovered(null);
    prevGrab = false;
    interaction.state = 'idle';
    return result;
  }

  ndc.set(intent.screen.x * 2 - 1, -(intent.screen.y * 2 - 1));
  raycaster.setFromCamera(ndc, camera);

  const grabStarted = intent.grab && !prevGrab;
  const grabEnded = !intent.grab && prevGrab;
  prevGrab = intent.grab;

  if (interaction.held) {
    if (grabEnded) {
      const piece = release();
      if (piece && isOverTrash(intent.screen)) {
        if (interaction.hovered === piece) interaction.hovered = null;
        removePiece(piece);
        result.trashed = true;
      }
    } else {
      updateTarget(intent, camera);
    }
  }

  if (!interaction.held) {
    // Buscar la pieza bajo el cursor (no si esta sobre un panel)
    let hit = null;
    if (!intent.overUI) {
      hit = raycaster.intersectObjects(pieceMeshes(), false)[0] ?? null;
    }
    setHovered(hit ? pieceFromMesh(hit.object) : null);
    if (hit) lastHit = { piece: interaction.hovered, point: hit.point.clone(), time: performance.now() };

    // Solo se agarra si el pellizco EMPIEZA sobre una pieza: pellizcar en el
    // aire y luego pasar por encima de una pieza no la toma.
    // Al cerrar el pellizco el pulgar se mueve y el cursor (punto medio
    // pulgar-indice) se corre un poco; por eso tambien vale la ultima pieza
    // apuntada si fue hace muy poco.
    if (grabStarted) {
      if (hit && interaction.hovered) {
        startHold(interaction.hovered, hit.point, camera, intent);
      } else if (lastHit && performance.now() - lastHit.time < STICKY_MS && pieces.includes(lastHit.piece)) {
        startHold(lastHit.piece, lastHit.point, camera, intent);
      }
    }
  }

  interaction.state = interaction.held ? 'holding' : interaction.hovered ? 'hover' : 'idle';
  return result;
}

/** Calcula donde y como deberia estar la pieza agarrada. */
function updateTarget(intent, camera) {
  // Distancia: la del agarre, escalada por cuanto cambio la profundidad
  const distance = grab.distance * Math.exp((intent.depth - grab.depthStart) * GRAB.depthGain);
  grab.target
    .copy(raycaster.ray.direction)
    .multiplyScalar(distance)
    .add(raycaster.ray.origin)
    .add(grab.offset);

  // No salir de la mesa ni hundirse en ella
  const mx = TABLE.width / 2 - 0.5;
  const mz = TABLE.depth / 2 - 0.5;
  grab.target.x = clamp(grab.target.x, -mx, mx);
  grab.target.z = clamp(grab.target.z, -mz, mz);
  grab.target.y = clamp(grab.target.y, GRAB.minHeight, GRAB.maxHeight);

  // Rotacion: girar alrededor del eje de la vista (hacia dentro de la pantalla).
  // Girar la muneca en sentido horario gira la pieza en sentido horario.
  camera.getWorldDirection(forward);
  const angle = (intent.roll - grab.rollStart) * GRAB.rollGain;
  tmpQ.setFromAxisAngle(forward, angle);
  grab.targetQuat.copy(tmpQ).multiply(grab.startQuat);
}

/**
 * Control de la pieza agarrada en cada sub-paso de la fisica.
 * Velocidad lineal: proporcional a la distancia al objetivo.
 * Velocidad angular: proporcional al angulo que falta para la rotacion objetivo.
 */
onPreStep(() => {
  const piece = interaction.held;
  if (!piece) return;
  const body = piece.body;
  body.wakeUp();

  // --- Posicion ---
  let vx = (grab.target.x - body.position.x) * GRAB.positionGain;
  let vy = (grab.target.y - body.position.y) * GRAB.positionGain;
  let vz = (grab.target.z - body.position.z) * GRAB.positionGain;
  const speed = Math.hypot(vx, vy, vz);
  if (speed > GRAB.maxSpeed) {
    const s = GRAB.maxSpeed / speed;
    vx *= s; vy *= s; vz *= s;
  }
  body.velocity.set(vx, vy, vz);

  // --- Rotacion: error = objetivo * actual^-1, convertido a eje-angulo ---
  tmpQ2.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w).invert();
  tmpQ.copy(grab.targetQuat).multiply(tmpQ2);
  if (tmpQ.w < 0) tmpQ.set(-tmpQ.x, -tmpQ.y, -tmpQ.z, -tmpQ.w); // camino mas corto
  const angle = 2 * Math.acos(clamp(tmpQ.w, -1, 1));
  const s = Math.sqrt(1 - tmpQ.w * tmpQ.w);
  if (angle < 1e-3 || s < 1e-6) {
    body.angularVelocity.set(0, 0, 0);
  } else {
    const k = (angle * GRAB.rotationGain) / s;
    body.angularVelocity.set(tmpQ.x * k, tmpQ.y * k, tmpQ.z * k);
  }
});
