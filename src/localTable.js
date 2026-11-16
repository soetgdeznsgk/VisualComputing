// ============================================================
// localTable.js — Mesa en este computador (un jugador)
// ============================================================
// Corre la simulacion (sim/simulation.js) aqui mismo en el navegador y
// copia la posicion de cada cuerpo fisico a su malla.
//
// LocalTable y RemoteTable (remoteTable.js) tienen los MISMOS metodos,
// asi el resto de la app no necesita saber si se juega solo o en red:
//
//   loadBoard(id)  spawn(type, color)  remove(id)  clear()  rollDice()
//   grab(id) -> bool   hold(id, target, quat)   release(id)
//   update(dt)   sendCursor(point)   isHeldByOther(view)
//
// Avisa a la app con los callbacks de `handlers`:
//   onBoard(boardId)  onDice(result)  onToast(text)
// ============================================================

import { Simulation } from './sim/simulation.js';
import { resetViews, createView, removeView, getView } from './pieceViews.js';

const PLAYER = 'local';

export class LocalTable {
  /** @param {{onBoard, onDice, onToast}} handlers */
  constructor(handlers) {
    this.mode = 'local';
    this.handlers = handlers;
    this.boardId = null;
    this.active = true;
    this.sim = new Simulation({ onEvent: (e) => this.onSimEvent(e) });
  }

  onSimEvent(e) {
    if (!this.active) return;
    switch (e.type) {
      case 'board':
        this.boardId = e.boardId;
        resetViews(e.pieces);
        this.handlers.onBoard(e.boardId);
        break;
      case 'spawn':
        createView(e.piece);
        break;
      case 'remove':
        removeView(e.id);
        break;
      case 'dice':
        this.handlers.onDice(e.result);
        break;
      case 'fell':
        this.handlers.onToast('Una pieza cayó de la mesa');
        break;
    }
  }

  /** Vuelve a usar la mesa local (al salir del multijugador). */
  activate(boardId) {
    this.active = true;
    this.loadBoard(boardId ?? this.boardId ?? 'free');
  }

  /** Deja de usar la mesa local (al entrar al multijugador): vacia la simulacion. */
  deactivate() {
    this.active = false;
    [...this.sim.pieces.keys()].forEach((id) => this.sim.remove(id, true));
    this.sim.holds.clear();
  }

  loadBoard(id) {
    this.sim.loadBoard(id);
  }

  spawn(type, color) {
    if (!this.sim.spawn(type, color)) this.handlers.onToast('Llegaste al límite de piezas: elimina algunas');
  }

  remove(id) {
    this.sim.remove(id);
  }

  clear() {
    this.sim.clear();
  }

  rollDice() {
    this.sim.rollDice();
  }

  grab(id) {
    return this.sim.grab(PLAYER, id);
  }

  hold(id, target, quat) {
    this.sim.hold(PLAYER, id, target, quat);
  }

  release() {
    this.sim.release(PLAYER);
  }

  isHeldByOther() {
    return false; // en modo local no hay otros jugadores
  }

  playerColor() {
    return '#ffffff';
  }

  sendCursor() {}

  /** Avanza la fisica y copia cuerpo -> malla. */
  update() {
    if (!this.active) return;
    this.sim.step();
    for (const p of this.sim.pieces.values()) {
      const view = getView(p.id);
      if (!view) continue;
      view.mesh.position.copy(p.body.position);
      view.mesh.quaternion.copy(p.body.quaternion);
    }
  }
}
