// ============================================================
// sim/simulation.js — La mesa de juego (fisica + reglas de la mesa)
// ============================================================
// Una Simulation contiene TODO el estado real de la mesa: el tablero
// actual, las piezas con sus cuerpos fisicos, quien sostiene cada pieza,
// las fichas que se estan acomodando y los dados.
//
// No dibuja nada ni usa el navegador, asi que se usa en dos lugares:
//   - localTable.js  (un solo computador: corre en el navegador)
//   - server/gameServer.js (multijugador: corre en el servidor Node.js
//     y los navegadores solo dibujan lo que el servidor les envia)
//
// Cada jugador se identifica con un `playerId` ('local' en modo local).
// Para que la vista se entere de los cambios, la simulacion emite
// eventos por el callback onEvent:
//   { type: 'board', boardId, pieces }  se cargo un tablero (lista completa)
//   { type: 'spawn', piece }            aparecio una pieza
//   { type: 'remove', id }              se elimino una pieza
//   { type: 'dice', result }            los dados terminaron de rodar
//   { type: 'fell', id }                una pieza cayo de la mesa
// ============================================================

import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { PHYSICS, TABLE, GRAB } from '../config.js';
import { world, woodMaterial, onPreStep, stepPhysics } from './physics.js';
import { createTableBodies } from './table.js';
import { driveBody } from './bodyControl.js';
import { Snapper } from './snapping.js';
import { DiceDetector, throwDice } from './diceLogic.js';
import { buildBody, resolveColor } from '../pieceCatalog.js';
import { getBoard } from '../boards/index.js';

const DENSITY = 0.15;          // masa por unidad de volumen
const HOLD_TIMEOUT_MS = 1500;  // si un jugador deja de enviar su mano, se suelta la pieza

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const finite = (...xs) => xs.every((x) => typeof x === 'number' && Number.isFinite(x));
const round = (v, d) => Math.round(v * d) / d;

/**
 * @typedef {object} SimPiece
 * @property {number} id
 * @property {string} type   — id del catalogo
 * @property {object} def    — definicion del catalogo (flags como snappable)
 * @property {string} color  — hex
 * @property {CANNON.Body} body
 * @property {{position:{x,y,z}, rotationY:number}|null} home — a donde vuelve si se cae
 */

export class Simulation {
  /** @param {{onEvent?: (event:object) => void}} options */
  constructor({ onEvent = () => {} } = {}) {
    this.onEvent = onEvent;
    /** @type {Map<number, SimPiece>} */
    this.pieces = new Map();
    this.nextId = 1;
    this.board = null;
    /** Pieza que sostiene cada jugador: playerId -> { pieceId, target, quat, time } */
    this.holds = new Map();
    this.snapper = new Snapper(this);
    this.dice = new DiceDetector();
    this.loading = false;
    this.lastSent = new Map(); // para enviar solo lo que cambio (snapshotDelta)

    createTableBodies();
    onPreStep(() => this.preStep());
  }

  // ----------------------------------------------------------
  // Piezas
  // ----------------------------------------------------------

  /**
   * Pone una pieza nueva sobre la mesa.
   * @param {string} type — id del catalogo
   * @param {string} color — hex, o id de color ('mix' = al azar)
   * @param {{position:{x,y,z}, rotationY?:number, home?:boolean}|null} placement
   *   si es null, cae desde arriba en un punto al azar cerca del centro
   * @returns {SimPiece|null} null si se llego al limite
   */
  spawn(type, color, placement = null) {
    if (this.pieces.size >= PHYSICS.maxPieces) return null;
    const built = buildBody(type);

    const body = new CANNON.Body({
      mass: Math.max(0.2, built.volume * DENSITY),
      material: woodMaterial,
      linearDamping: 0.05,
      angularDamping: 0.1,
      sleepSpeedLimit: 0.25,
      sleepTimeLimit: 0.6,
    });
    built.shapes.forEach(({ shape, offset, orientation }) => body.addShape(shape, offset, orientation));

    if (placement) {
      const { x, y, z } = placement.position;
      body.position.set(x, y, z);
      body.quaternion.setFromEuler(0, placement.rotationY ?? 0, 0);
    } else {
      const spread = 0.35;
      body.position.set(
        (Math.random() - 0.5) * TABLE.width * spread,
        6 + built.size + Math.random() * 2,
        (Math.random() - 0.5) * TABLE.depth * spread,
      );
      body.quaternion.setFromEuler(0, Math.random() * Math.PI * 2, 0);
    }

    const piece = {
      id: this.nextId++,
      type,
      def: built.def,
      color: resolveColor(color),
      body,
      home: placement?.home ? { position: { ...placement.position }, rotationY: placement.rotationY ?? 0 } : null,
    };
    world.addBody(body);
    this.pieces.set(piece.id, piece);
    if (!this.loading) this.onEvent({ type: 'spawn', piece: this.describe(piece) });
    return piece;
  }

  /** Elimina una pieza. */
  remove(id, silent = false) {
    const piece = this.pieces.get(id);
    if (!piece) return;
    for (const [playerId, h] of this.holds) if (h.pieceId === id) this.holds.delete(playerId);
    this.snapper.cancel(id);
    world.removeBody(piece.body);
    this.pieces.delete(id);
    this.lastSent.delete(id);
    if (!silent) this.onEvent({ type: 'remove', id });
  }

  /** Elimina todas las piezas. */
  clear() {
    [...this.pieces.keys()].forEach((id) => this.remove(id));
  }

  /**
   * Carga un tablero: limpia la mesa, configura sus casillas y pone sus
   * piezas iniciales. Emite un solo evento 'board' con la lista completa.
   * @param {string} id — 'free', 'parques', 'chess', 'checkers', 'tictactoe'
   */
  loadBoard(id) {
    this.loading = true;
    [...this.pieces.keys()].forEach((pid) => this.remove(pid, true));
    this.holds.clear();
    this.board = getBoard(id);
    this.snapper.configure(this.board.snap);
    for (const s of this.board.setup()) {
      this.spawn(s.type, s.color, s.position ? s : null);
    }
    this.dice.reset();
    this.loading = false;
    this.lastSent.clear();
    this.onEvent({ type: 'board', boardId: this.board.id, pieces: this.snapshotFull() });
  }

  // ----------------------------------------------------------
  // Manos de los jugadores
  // ----------------------------------------------------------

  /** Jugador que sostiene una pieza, o null. */
  heldBy(pieceId) {
    for (const [playerId, h] of this.holds) if (h.pieceId === pieceId) return playerId;
    return null;
  }

  /**
   * Un jugador agarra una pieza. Falla si otro jugador ya la tiene.
   * @returns {boolean}
   */
  grab(playerId, pieceId) {
    const piece = this.pieces.get(pieceId);
    if (!piece) return false;
    const holder = this.heldBy(pieceId);
    if (holder !== null && holder !== playerId) return false;
    if (this.holds.has(playerId) && this.holds.get(playerId).pieceId !== pieceId) this.release(playerId);

    const b = piece.body;
    this.holds.set(playerId, {
      pieceId,
      target: new THREE.Vector3(b.position.x, b.position.y, b.position.z),
      quat: new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w),
      time: performance.now(),
    });
    this.snapper.cancel(pieceId); // si se estaba acomodando, ahora manda la mano
    return true;
  }

  /**
   * Nueva pose objetivo de la pieza que sostiene un jugador. La calcula el
   * navegador del jugador con su mano y su camara (interaction.js).
   * @param {{x,y,z}} target
   * @param {{x,y,z,w}} quat
   */
  hold(playerId, pieceId, target, quat) {
    const h = this.holds.get(playerId);
    if (!h || h.pieceId !== pieceId) return;
    if (!finite(target.x, target.y, target.z, quat.x, quat.y, quat.z, quat.w)) return;
    // Mismos limites que en el navegador: no salir de la mesa ni hundirse
    h.target.set(
      clamp(target.x, -TABLE.width / 2 + 0.5, TABLE.width / 2 - 0.5),
      clamp(target.y, GRAB.minHeight, GRAB.maxHeight),
      clamp(target.z, -TABLE.depth / 2 + 0.5, TABLE.depth / 2 - 0.5),
    );
    h.quat.set(quat.x, quat.y, quat.z, quat.w).normalize();
    h.time = performance.now();
  }

  /**
   * Un jugador suelta lo que tiene. La pieza conserva su velocidad (se
   * puede lanzar) y, si es una ficha cerca de una casilla, se acomoda.
   */
  release(playerId) {
    const h = this.holds.get(playerId);
    if (!h) return;
    this.holds.delete(playerId);
    const piece = this.pieces.get(h.pieceId);
    if (!piece) return;
    const v = piece.body.velocity;
    const speed = v.length();
    if (speed > GRAB.maxThrowSpeed) v.scale(GRAB.maxThrowSpeed / speed, v);
    piece.body.angularVelocity.scale(0.3, piece.body.angularVelocity);
    this.snapper.trySnap(piece);
  }

  /** Lanza los dados que nadie sostiene (boton "Lanzar dados"). */
  rollDice() {
    const zone = this.board?.diceZone;
    if (!zone) return;
    const dice = [...this.pieces.values()].filter((p) => p.type === 'die' && this.heldBy(p.id) === null);
    if (dice.length === 0) return;
    throwDice(dice, zone);
    this.dice.arm();
  }

  // ----------------------------------------------------------
  // Paso de simulacion
  // ----------------------------------------------------------

  /** Se ejecuta antes de cada sub-paso de la fisica. */
  preStep() {
    const now = performance.now();
    for (const [playerId, h] of this.holds) {
      const piece = this.pieces.get(h.pieceId);
      if (!piece) { this.holds.delete(playerId); continue; }
      if (now - h.time > HOLD_TIMEOUT_MS) { this.release(playerId); continue; }
      driveBody(piece.body, h.target, h.quat, GRAB);
    }
    this.snapper.drive();
  }

  /** Avanza la simulacion. Llamar una vez por frame (o por tick del servidor). */
  step() {
    stepPhysics();

    // Piezas que cayeron de la mesa: vuelven a su inicio o se eliminan
    for (const p of [...this.pieces.values()]) {
      if (p.body.position.y >= PHYSICS.fallLimitY) continue;
      if (p.home) {
        const { x, y, z } = p.home.position;
        p.body.position.set(x, y + 1, z);
        p.body.quaternion.setFromEuler(0, p.home.rotationY, 0);
        p.body.velocity.set(0, 0, 0);
        p.body.angularVelocity.set(0, 0, 0);
        p.body.wakeUp();
      } else {
        this.remove(p.id);
        this.onEvent({ type: 'fell', id: p.id });
      }
    }

    // Dados
    const dice = [...this.pieces.values()].filter((p) => p.type === 'die');
    const result = this.dice.update(dice, (id) => this.heldBy(id) !== null);
    if (result) this.onEvent({ type: 'dice', result });
  }

  // ----------------------------------------------------------
  // Estado como datos (para dibujarlo o enviarlo por red)
  // ----------------------------------------------------------

  /** Descripcion completa de una pieza (JSON). */
  describe(p) {
    const b = p.body;
    return {
      id: p.id,
      type: p.type,
      color: p.color,
      p: [round(b.position.x, 1e3), round(b.position.y, 1e3), round(b.position.z, 1e3)],
      q: [round(b.quaternion.x, 1e4), round(b.quaternion.y, 1e4), round(b.quaternion.z, 1e4), round(b.quaternion.w, 1e4)],
      h: this.heldBy(p.id) ?? 0,
    };
  }

  /** Todas las piezas. */
  snapshotFull() {
    return [...this.pieces.values()].map((p) => this.describe(p));
  }

  /**
   * Solo las piezas que cambiaron desde la ultima llamada, en formato
   * compacto: [id, x, y, z, qx, qy, qz, qw, holder]. Las piezas quietas
   * no se envian, asi la red casi no se usa cuando nadie juega.
   */
  snapshotDelta() {
    const out = [];
    for (const p of this.pieces.values()) {
      const d = this.describe(p);
      const row = [d.id, ...d.p, ...d.q, d.h];
      const prev = this.lastSent.get(p.id);
      if (!prev || row.some((v, i) => v !== prev[i])) {
        out.push(row);
        this.lastSent.set(p.id, row);
      }
    }
    return out;
  }
}
