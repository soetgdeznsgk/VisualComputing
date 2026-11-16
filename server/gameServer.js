// ============================================================
// server/gameServer.js — Servidor del multijugador (Node.js)
// ============================================================
// Una sola mesa compartida por todos los jugadores conectados.
//
// El servidor tiene la AUTORIDAD: corre la simulacion fisica
// (src/sim/simulation.js, la misma que usa el modo local) y es el unico
// que decide donde esta cada pieza. Los navegadores:
//   - envian lo que hace su mano (agarrar, pose objetivo, soltar, cursor)
//   - reciben el estado de la mesa y lo dibujan
// La camara y MediaPipe corren en cada navegador: el video nunca viaja
// por la red, solo la interpretacion de los gestos.
//
// Protocolo (JSON por WebSocket en la ruta /ws):
//   navegador -> servidor
//     hello {name}                      unirse con un nombre
//     board {id}                        cambiar de juego (el mismo = reiniciar)
//     spawn {type, color}               poner un bloque (solo en Bloques)
//     remove {id} / clear {}            borrar una pieza / limpiar (solo en Bloques)
//     grab {id}                         agarrar una pieza
//     hold {id, p:[x,y,z], q:[x,y,z,w]} pose objetivo de la pieza agarrada
//     release {}                        soltar
//     roll {}                           lanzar los dados
//     cursor {p:[x,y,z]|null}           a donde apunta el jugador
//   servidor -> navegador
//     welcome {you, players, board, pieces, addresses}
//     players {players}                 alguien entro, salio o cambio de nombre
//     board {board, pieces}             se cambio de juego (lista completa)
//     spawn {piece} / remove {id}
//     state {p:[[id,x,y,z,qx,qy,qz,qw,holder]...], c:{playerId:[x,y,z]}}
//                                       20 veces/s: solo las piezas que se movieron
//     grabDenied {id}                   otro jugador ya tiene esa pieza
//     dice {result}                     resultado de los dados
//     toast {text}                      mensaje corto
// ============================================================

import os from 'node:os';
import { WebSocketServer } from 'ws';
import { Simulation } from '../src/sim/simulation.js';
import { BOARDS } from '../src/boards/index.js';
import { BUILD_PIECES, COLORS } from '../src/pieceCatalog.js';

const TICK_MS = 1000 / 60;      // paso de la simulacion
const BROADCAST_EVERY = 3;      // enviar estado cada 3 pasos = 20 veces por segundo
const MAX_PLAYERS = 6;
const PLAYER_COLORS = ['#f8961e', '#4cc9f0', '#e63946', '#80ed99', '#c77dff', '#ffd166'];

// --- Validacion de mensajes (nunca confiar en lo que llega por la red) ---
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isVec = (a, n) => Array.isArray(a) && a.length === n && a.every(isNum);
const isId = (v) => Number.isInteger(v) && v > 0;
const cleanName = (s) => (typeof s === 'string' ? s.replace(/[<>]/g, '').trim().slice(0, 20) : '');
const isColor = (c) => typeof c === 'string' && (/^#[0-9a-f]{6}$/i.test(c) || COLORS.some((k) => k.id === c));

/** Direcciones IPv4 de la red local de este computador (para invitar a otros). */
function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

class Game {
  constructor() {
    /** @type {Map<number, {id, name, color, ws, cursor}>} */
    this.players = new Map();
    this.nextPlayerId = 1;
    this.tick = 0;
    this.sim = new Simulation({ onEvent: (e) => this.onSimEvent(e) });
    this.sim.loadBoard('free');
    this.timer = setInterval(() => this.step(), TICK_MS);
  }

  // ----------------------------------------------------------
  // Envio
  // ----------------------------------------------------------

  send(player, msg) {
    if (player.ws.readyState === player.ws.OPEN) player.ws.send(JSON.stringify(msg));
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.ws.readyState === p.ws.OPEN) p.ws.send(data);
  }

  playerList() {
    return [...this.players.values()].map(({ id, name, color }) => ({ id, name, color }));
  }

  /** Eventos de la simulacion -> mensajes para todos. */
  onSimEvent(e) {
    switch (e.type) {
      case 'board': this.broadcast({ t: 'board', board: e.boardId, pieces: e.pieces }); break;
      case 'spawn': this.broadcast({ t: 'spawn', piece: e.piece }); break;
      case 'remove': this.broadcast({ t: 'remove', id: e.id }); break;
      case 'dice': this.broadcast({ t: 'dice', result: e.result }); break;
    }
  }

  // ----------------------------------------------------------
  // Bucle
  // ----------------------------------------------------------

  step() {
    if (this.players.size === 0) return; // sin jugadores no hace falta simular
    this.sim.step();
    this.tick++;
    if (this.tick % BROADCAST_EVERY !== 0) return;
    const cursors = {};
    for (const p of this.players.values()) if (p.cursor) cursors[p.id] = p.cursor;
    // El estado completo ya llego con welcome/board; aqui solo lo que cambio
    this.broadcast({ t: 'state', p: this.sim.snapshotDelta(), c: cursors });
  }

  // ----------------------------------------------------------
  // Jugadores
  // ----------------------------------------------------------

  /** Primer color libre de la paleta. */
  freeColor() {
    const used = new Set([...this.players.values()].map((p) => p.color));
    return PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[this.nextPlayerId % PLAYER_COLORS.length];
  }

  join(ws, name) {
    if (this.players.size >= MAX_PLAYERS) {
      ws.send(JSON.stringify({ t: 'toast', text: `La mesa está llena (máximo ${MAX_PLAYERS} jugadores)` }));
      ws.close();
      return null;
    }
    const id = this.nextPlayerId++;
    const player = { id, name: cleanName(name) || `Jugador ${id}`, color: this.freeColor(), ws, cursor: null };
    this.players.set(id, player);
    if (this.players.size === 1) this.sim.dice.reset(); // la mesa estaba en pausa
    this.send(player, {
      t: 'welcome',
      you: { id, name: player.name, color: player.color },
      players: this.playerList(),
      board: this.sim.board.id,
      pieces: this.sim.snapshotFull(),
      addresses: lanAddresses(),
    });
    this.broadcast({ t: 'players', players: this.playerList() });
    this.broadcast({ t: 'toast', text: `${player.name} se unió a la mesa` });
    console.log(`[mesa] ${player.name} se unio (${this.players.size} jugadores)`);
    return player;
  }

  leave(player) {
    if (!this.players.has(player.id)) return;
    this.sim.release(player.id); // si tenia una pieza en la mano, la suelta
    this.players.delete(player.id);
    this.broadcast({ t: 'players', players: this.playerList() });
    this.broadcast({ t: 'toast', text: `${player.name} salió de la mesa` });
    console.log(`[mesa] ${player.name} salio (${this.players.size} jugadores)`);
  }

  /** Un mensaje de un jugador ya unido. */
  handle(player, msg) {
    const board = this.sim.board;
    switch (msg.t) {
      case 'board': {
        // Cargar el mismo tablero que ya esta = reiniciar la partida
        const next = BOARDS.find((b) => b.id === msg.id);
        if (!next) return;
        const restart = next.id === board.id;
        this.sim.loadBoard(next.id);
        this.broadcast({ t: 'toast', text: restart ? `${player.name} reinició la partida` : `${player.name} cambió el juego a ${next.name}` });
        break;
      }
      case 'spawn':
        if (!board.ui.buildPalette || !BUILD_PIECES.some((p) => p.id === msg.type) || !isColor(msg.color)) return;
        if (!this.sim.spawn(msg.type, msg.color)) this.send(player, { t: 'toast', text: 'Llegaron al límite de piezas: eliminen algunas' });
        break;
      case 'remove':
        if (!board.ui.trash || !isId(msg.id)) return;
        if (this.sim.heldBy(msg.id) !== null && this.sim.heldBy(msg.id) !== player.id) return;
        this.sim.remove(msg.id);
        break;
      case 'clear':
        if (!board.ui.buildPalette) return;
        this.sim.clear();
        this.broadcast({ t: 'toast', text: `${player.name} limpió la mesa` });
        break;
      case 'grab':
        if (!isId(msg.id)) return;
        if (!this.sim.grab(player.id, msg.id)) this.send(player, { t: 'grabDenied', id: msg.id });
        break;
      case 'hold':
        if (!isId(msg.id) || !isVec(msg.p, 3) || !isVec(msg.q, 4)) return;
        this.sim.hold(player.id, msg.id,
          { x: msg.p[0], y: msg.p[1], z: msg.p[2] },
          { x: msg.q[0], y: msg.q[1], z: msg.q[2], w: msg.q[3] });
        break;
      case 'release':
        this.sim.release(player.id);
        break;
      case 'roll':
        this.sim.rollDice();
        break;
      case 'cursor':
        player.cursor = isVec(msg.p, 3) ? msg.p : null;
        break;
    }
  }

  /** Nueva conexion WebSocket. */
  connect(ws) {
    let player = null;
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      if (!player) {
        if (msg.t === 'hello') player = this.join(ws, msg.name);
        return;
      }
      this.handle(player, msg);
    });
    ws.on('close', () => { if (player) this.leave(player); });
    ws.on('error', () => ws.close());
  }
}

/**
 * La mesa es una sola aunque Vite recargue su configuracion (por eso se
 * guarda en globalThis): asi no se pierde la partida al editar el codigo.
 */
function getGame() {
  globalThis.__mesaGame ??= new Game();
  return globalThis.__mesaGame;
}

/**
 * Conecta el servidor de juego a un servidor HTTP(S) existente (el de
 * Vite): las conexiones WebSocket a /ws son del juego; el resto (por
 * ejemplo la recarga en caliente de Vite) se deja pasar.
 * @param {import('node:http').Server} httpServer
 */
export function attachGameServer(httpServer) {
  const game = getGame();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  wss.on('connection', (ws) => game.connect(ws));
  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/ws')) return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  return game;
}
