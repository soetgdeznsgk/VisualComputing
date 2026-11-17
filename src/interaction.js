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
//   5. Soltar: la pieza conserva su velocidad (se puede lanzar). Si es una
//      ficha y el tablero tiene casillas imantadas, se acomoda sola.
//
// Este modulo solo CALCULA la pose objetivo de la pieza (posicion y
// rotacion) con la camara y la mano de este jugador. Quien la mueve es la
// mesa activa (`table`): la simulacion local o el servidor en red, que le
// dan a la pieza la velocidad necesaria para llegar al objetivo (asi sigue
// chocando con las demas en vez de atravesarlas).
// ============================================================

import * as THREE from 'three';
import { GRAB, TABLE } from './config.js';
import { hasView, viewFromMesh, viewMeshes, allViews, setGlow, setHoverGlow } from './pieceViews.js';
import { updateSnapPreview, hideSnapPreview } from './snapPreview.js';

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
  hovered: null,   // vista de la pieza bajo el cursor
  held: null,      // vista de la pieza agarrada
  point: null,     // punto 3D al que apunta este jugador (para los demas jugadores)
};

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const planeHit = new THREE.Vector3();
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

const tmpQ = new THREE.Quaternion();
const forward = new THREE.Vector3();

function startHold(view, hitPoint, camera, intent, table) {
  if (table.isHeldByOther(view) || !table.grab(view.id)) return;
  interaction.held = view;
  grab.distance = camera.position.distanceTo(hitPoint);
  grab.offset.copy(view.mesh.position).sub(hitPoint);
  grab.depthStart = intent.depth;
  grab.rollStart = intent.roll;
  grab.startQuat.copy(view.mesh.quaternion);
  grab.target.copy(view.mesh.position);
  grab.targetQuat.copy(grab.startQuat);
}

/** Suelta la pieza agarrada. */
function release(table) {
  const view = interaction.held;
  if (!view) return null;
  table.release(view.id);
  interaction.held = null;
  hideSnapPreview();
  return view;
}

/**
 * Llamar una vez por frame (antes de actualizar la mesa).
 * @param {PointerIntent} intent
 * @param {THREE.PerspectiveCamera} camera
 * @param {object} table — LocalTable o RemoteTable
 * @param {object} options
 * @param {(screen:{x,y}) => boolean} options.isOverTrash — si el cursor esta sobre la papelera
 * @param {string} options.boardId — tablero actual (para el anillo de casillas)
 * @returns {{trashed: boolean}} si en este frame se tiro una pieza a la papelera
 */
export function updateInteraction(intent, camera, table, { isOverTrash, boardId }) {
  const result = { trashed: false };

  // Si una pieza desaparecio (boton "Limpiar", cambio de tablero, la
  // elimino otro jugador), olvidarla.
  if (interaction.held && !hasView(interaction.held)) interaction.held = null;
  if (interaction.hovered && !hasView(interaction.hovered)) interaction.hovered = null;

  if (!intent.active) {
    if (interaction.held) release(table);
    interaction.hovered = null;
    interaction.point = null;
    prevGrab = false;
    interaction.state = 'idle';
    updateGlows(table);
    return result;
  }

  ndc.set(intent.screen.x * 2 - 1, -(intent.screen.y * 2 - 1));
  raycaster.setFromCamera(ndc, camera);

  const grabStarted = intent.grab && !prevGrab;
  const grabEnded = !intent.grab && prevGrab;
  prevGrab = intent.grab;

  if (interaction.held) {
    if (grabEnded) {
      const view = release(table);
      if (view && isOverTrash(intent.screen)) {
        table.remove(view.id);
        result.trashed = true;
      }
    } else {
      updateTarget(intent, camera);
      table.hold(interaction.held.id, grab.target, grab.targetQuat);
      updateSnapPreview(interaction.held, boardId);
    }
  }

  let hit = null;
  if (!interaction.held) {
    // Buscar la pieza bajo el cursor (no si esta sobre un panel)
    if (!intent.overUI) hit = raycaster.intersectObjects(viewMeshes(), false)[0] ?? null;
    interaction.hovered = hit ? viewFromMesh(hit.object) : null;
    if (hit) lastHit = { view: interaction.hovered, point: hit.point.clone(), time: performance.now() };

    // Solo se agarra si el pellizco EMPIEZA sobre una pieza: pellizcar en el
    // aire y luego pasar por encima de una pieza no la toma.
    // Al cerrar el pellizco el pulgar se mueve y el cursor (punto medio
    // pulgar-indice) se corre un poco; por eso tambien vale la ultima pieza
    // apuntada si fue hace muy poco.
    if (grabStarted) {
      if (hit && interaction.hovered) {
        startHold(interaction.hovered, hit.point, camera, intent, table);
      } else if (lastHit && performance.now() - lastHit.time < STICKY_MS && hasView(lastHit.view)) {
        startHold(lastHit.view, lastHit.point, camera, intent, table);
      }
    }
  }

  // Punto al que apunta este jugador (lo ven los demas en multijugador)
  if (interaction.held) interaction.point = interaction.held.mesh.position.clone();
  else if (hit) interaction.point = hit.point.clone();
  else interaction.point = raycaster.ray.intersectPlane(tablePlane, planeHit)?.clone() ?? null;

  interaction.state = interaction.held ? 'holding' : interaction.hovered ? 'hover' : 'idle';
  updateGlows(table);
  return result;
}

/**
 * Brillo de las piezas: la que esta bajo el cursor o en la mano brilla
 * calido; las que sostienen otros jugadores brillan con su color.
 */
function updateGlows(table) {
  for (const view of allViews()) {
    if (view === interaction.held || view === interaction.hovered) {
      setHoverGlow(view, true);
    } else if (table.isHeldByOther(view)) {
      setGlow(view, new THREE.Color(table.playerColor(view.heldBy)).multiplyScalar(0.45));
    } else {
      setHoverGlow(view, false);
    }
  }
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

/** Suelta lo que se tenga (al cambiar de mesa local <-> red). */
export function resetInteraction(table) {
  if (interaction.held) release(table);
  interaction.held = null;
  interaction.hovered = null;
  prevGrab = false;
}
