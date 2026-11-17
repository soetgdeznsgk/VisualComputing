// ============================================================
// remoteTable.js — Mesa compartida en red (multijugador)
// ============================================================
// La simulacion corre en el servidor (server/gameServer.js). Este
// navegador:
//   1. Envia lo que hace su mano: agarrar, la pose objetivo de la pieza
//      sostenida, soltar, y donde esta su cursor.
//   2. Recibe ~20 veces por segundo la posicion de las piezas que se
//      movieron y las dibuja con INTERPOLACION: se muestra el estado de
//      hace INTERP_MS milisegundos, mezclando los dos estados recibidos
//      que lo rodean, asi el movimiento se ve fluido aunque lleguen menos
//      estados que cuadros por segundo.
//   3. La pieza que sostiene ESTE jugador se dibuja con PREDICCION: va
//      directo hacia su mano sin esperar al servidor, para que el agarre
//      se sienta inmediato.
//
// Tiene los mismos metodos que LocalTable (ver localTable.js).
// Callbacks extra: onPlayers(players, me), onStatus(state, detail),
// onCursors(cursors).
// ============================================================

import * as THREE from 'three';
import { GRAB } from './config.js';
import { resetViews, createView, removeView, getView, allViews } from './pieceViews.js';

const INTERP_MS = 110;       // retraso de dibujo para poder interpolar
const CURSOR_EVERY_MS = 50;  // envio del cursor (20 veces por segundo)
const HOLD_EVERY_MS = 25;    // envio de la mano (40 veces por segundo)
const RETRY_MS = 2000;       // espera antes de reconectar

const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

/** Direccion del servidor de juego: el mismo host que sirvio la pagina. */
function serverUrl() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${location.host}/ws`;
}

export class RemoteTable {
  /** @param {{onBoard, onDice, onToast, onPlayers, onStatus, onCursors}} handlers */
  constructor(handlers) {
    this.mode = 'remote';
    this.handlers = handlers;
    this.boardId = null;
    this.me = null;          // { id, name, color }
    this.players = [];
    this.addresses = [];     // direcciones de la red local del servidor
    this.ws = null;
    this.closedByUser = false;
    this.samples = new Map(); // id de pieza -> [{ t, p, q }] (ultimos estados)
    this.localHold = null;    // { id, target: Vector3, quat: Quaternion }
    this.lastCursorSent = 0;
    this.lastHoldSent = 0;
  }

  // ----------------------------------------------------------
  // Conexion
  // ----------------------------------------------------------

  /** Se conecta al servidor con un nombre de jugador. */
  connect(name) {
    this.name = name;
    this.closedByUser = false;
    this.handlers.onStatus('connecting');
    const ws = new WebSocket(serverUrl());
    this.ws = ws;

    ws.addEventListener('open', () => this.send({ t: 'hello', name }));
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this.handle(msg);
    });
    ws.addEventListener('close', () => {
      if (this.ws !== ws) return;
      this.localHold = null;
      if (this.closedByUser) {
        this.handlers.onStatus('offline');
        return;
      }
      // Se cayo la conexion: reintentar sin perder lo que se ve en pantalla
      this.handlers.onStatus('reconnecting');
      setTimeout(() => { if (!this.closedByUser) this.connect(this.name); }, RETRY_MS);
    });
  }

  /** Sale de la mesa compartida. */
  disconnect() {
    this.closedByUser = true;
    this.ws?.close();
    this.ws = null;
    this.samples.clear();
    this.localHold = null;
    this.handlers.onStatus('offline');
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  // ----------------------------------------------------------
  // Mensajes del servidor
  // ----------------------------------------------------------

  handle(msg) {
    switch (msg.t) {
      case 'welcome':
        this.me = msg.you;
        this.players = msg.players;
        this.addresses = msg.addresses ?? [];
        this.loadPieces(msg.board, msg.pieces);
        this.handlers.onStatus('online');
        this.handlers.onPlayers(this.players, this.me);
        break;
      case 'players':
        this.players = msg.players;
        this.handlers.onPlayers(this.players, this.me);
        break;
      case 'board':
        this.localHold = null;
        this.loadPieces(msg.board, msg.pieces);
        break;
      case 'spawn':
        createView(msg.piece);
        this.addSample(msg.piece.id, msg.piece.p, msg.piece.q);
        break;
      case 'remove':
        removeView(msg.id);
        this.samples.delete(msg.id);
        if (this.localHold?.id === msg.id) this.localHold = null;
        break;
      case 'state':
        for (const [id, x, y, z, qx, qy, qz, qw, h] of msg.p) {
          this.addSample(id, [x, y, z], [qx, qy, qz, qw]);
          const view = getView(id);
          if (view) view.heldBy = h;
        }
        this.handlers.onCursors(msg.c ?? {});
        break;
      case 'grabDenied':
        if (this.localHold?.id === msg.id) this.localHold = null;
        this.handlers.onToast('Otro jugador tiene esa pieza');
        break;
      case 'dice':
        this.handlers.onDice(msg.result);
        break;
      case 'toast':
        this.handlers.onToast(msg.text);
        break;
    }
  }

  loadPieces(boardId, pieces) {
    this.boardId = boardId;
    resetViews(pieces);
    this.samples.clear();
    pieces.forEach((p) => this.addSample(p.id, p.p, p.q));
    this.handlers.onBoard(boardId);
  }

  /** Guarda un estado recibido de una pieza (con la hora de llegada). */
  addSample(id, p, q) {
    const now = performance.now();
    let list = this.samples.get(id);
    if (!list) {
      list = [];
      this.samples.set(id, list);
    }
    // Si la pieza llevaba rato quieta, su ultimo estado es muy viejo:
    // se repite "justo antes" para que la interpolacion no adelante el movimiento.
    const last = list[list.length - 1];
    if (last && now - last.t > INTERP_MS * 2) list.push({ t: now - 50, p: last.p, q: last.q });
    list.push({ t: now, p: new THREE.Vector3().fromArray(p), q: new THREE.Quaternion().fromArray(q) });
    while (list.length > 4) list.shift();
  }

  // ----------------------------------------------------------
  // Acciones (mismos metodos que LocalTable)
  // ----------------------------------------------------------

  loadBoard(id) { this.send({ t: 'board', id }); }
  spawn(type, color) { this.send({ t: 'spawn', type, color }); }
  remove(id) { this.send({ t: 'remove', id }); }
  clear() { this.send({ t: 'clear' }); }
  rollDice() { this.send({ t: 'roll' }); }

  isHeldByOther(view) {
    return !!view?.heldBy && view.heldBy !== this.me?.id;
  }

  grab(id) {
    const view = getView(id);
    if (!view || this.isHeldByOther(view)) return false;
    this.localHold = {
      id,
      target: view.mesh.position.clone(),
      quat: view.mesh.quaternion.clone(),
    };
    view.heldBy = this.me?.id ?? 0;
    this.send({ t: 'grab', id });
    return true;
  }

  hold(id, target, quat) {
    if (this.localHold?.id !== id) return;
    this.localHold.target.copy(target);
    this.localHold.quat.copy(quat);
    const now = performance.now();
    if (now - this.lastHoldSent < HOLD_EVERY_MS) return;
    this.lastHoldSent = now;
    this.send({ t: 'hold', id, p: target.toArray(), q: quat.toArray() });
  }

  release(id) {
    if (this.localHold?.id !== id) return;
    // Ultima pose exacta antes de soltar, para que el lanzamiento salga bien
    this.send({ t: 'hold', id, p: this.localHold.target.toArray(), q: this.localHold.quat.toArray() });
    this.send({ t: 'release' });
    this.localHold = null;
  }

  /** Envia donde esta el cursor de este jugador (null = no hay mano). */
  sendCursor(point) {
    const now = performance.now();
    if (now - this.lastCursorSent < CURSOR_EVERY_MS) return;
    this.lastCursorSent = now;
    this.send({ t: 'cursor', p: point ? point.toArray().map((v) => Math.round(v * 100) / 100) : null });
  }

  /** Color de un jugador por su id. */
  playerColor(id) {
    return this.players.find((p) => p.id === id)?.color ?? '#ffffff';
  }

  // ----------------------------------------------------------
  // Dibujo
  // ----------------------------------------------------------

  /** Mueve cada malla: prediccion para la pieza propia, interpolacion para el resto. */
  update(dt) {
    const renderTime = performance.now() - INTERP_MS;
    for (const view of allViews()) {
      if (this.localHold?.id === view.id) {
        // Prediccion: seguir la mano con la misma "suavidad" que la fisica del servidor
        const k = 1 - Math.exp(-GRAB.positionGain * dt);
        view.mesh.position.lerp(this.localHold.target, k);
        view.mesh.quaternion.slerp(this.localHold.quat, Math.min(1, GRAB.rotationGain * dt));
        continue;
      }
      const list = this.samples.get(view.id);
      if (!list?.length) continue;
      interpolate(list, renderTime, tmpP, tmpQ);
      view.mesh.position.copy(tmpP);
      view.mesh.quaternion.copy(tmpQ);
    }
  }
}

/** Estado de una pieza en el instante `t`, entre los dos estados que lo rodean. */
function interpolate(list, t, outP, outQ) {
  if (t <= list[0].t) {
    outP.copy(list[0].p);
    outQ.copy(list[0].q);
    return;
  }
  for (let i = list.length - 1; i > 0; i--) {
    const a = list[i - 1], b = list[i];
    if (t >= a.t) {
      const k = Math.min(1, (t - a.t) / Math.max(1, b.t - a.t));
      outP.copy(a.p).lerp(b.p, k);
      outQ.copy(a.q).slerp(b.q, k);
      return;
    }
  }
  const last = list[list.length - 1];
  outP.copy(last.p);
  outQ.copy(last.q);
}
