// ============================================================
// app.js — Punto de entrada: conecta todos los modulos
// ============================================================
// Flujo de cada frame:
//
//   camara ──> handTracker ──> gestureInterpreter ──┬─> cameraRig   (mano izquierda)
//                                                   └─> interaction (mano derecha)
//   raton/teclado (mouseInput) ─────────────────────┘   (si no hay mano derecha)
//
//   interaction ──> table (pose objetivo de la pieza) ──> pieceViews ──> render
//
// `table` es la mesa activa, con los mismos metodos en los dos modos:
//   - LocalTable:  un computador; la simulacion (src/sim) corre aqui.
//   - RemoteTable: mesa compartida en red; la simulacion corre en el
//                  servidor (server/gameServer.js) y aqui solo se dibuja.
//
// Si la camara no esta disponible (permiso negado, sin webcam), la app
// sigue funcionando con el raton.
// ============================================================

import { initHandTracker, trackerStatus } from './handTracker.js';
import { updateGestures, gestures } from './gestureInterpreter.js';
import { initScene, camera, renderScene, setBoardMat } from './scene.js';
import { CameraRig } from './cameraRig.js';
import { interaction, updateInteraction, resetInteraction } from './interaction.js';
import { mouse, initMouseInput, updateMouse } from './mouseInput.js';
import { LocalTable } from './localTable.js';
import { RemoteTable } from './remoteTable.js';
import { allViews, clearViews } from './pieceViews.js';
import { updatePresence, animatePresence, clearPresence } from './presence.js';
import { getBoard } from './boards/index.js';
import { createMatMesh } from './boards/matTextures.js';
import { resolveColor } from './pieceCatalog.js';
import {
  initUI, setBoardUI, getSelectedColor, updateHandCursor, updateStatus, updateTrash,
  isOverTrash, drawHands, setTrackerStatus, showDiceResult, toast,
  setNetStatus, updatePlayers,
} from './ui.js';

let rig;
let localTable;
let remoteTable = null;
let table;              // mesa activa: localTable o remoteTable
let cursors = {};       // cursores de los otros jugadores (multijugador)
let lastSource = null;  // 'hand' | 'mouse' — quien controla la mano derecha
let lastTime = performance.now();

/** Avisos de la mesa activa (local o remota) a la interfaz. */
const tableHandlers = {
  onBoard: (boardId) => {
    const board = getBoard(boardId);
    setBoardMat(createMatMesh(board.mat));
    setBoardUI(board);
    rig.setHome(board.camera);
  },
  onDice: showDiceResult,
  onToast: toast,
  onPlayers: (players, me) => updatePlayers(players, me, remoteTable?.addresses ?? []),
  onStatus: (state) => setNetStatus(state),
  onCursors: (c) => { cursors = c; },
};

function main() {
  const canvas = document.getElementById('canvas3d');
  const video = document.getElementById('webcam');

  // 1. Escena y camara
  initScene(canvas);
  rig = new CameraRig(camera);

  // 2. Interfaz: cada accion va a la mesa activa
  initUI({
    onSelectBoard: (id) => {
      if (table.boardId !== id) table.loadBoard(id);
    },
    onSpawn: (type) => table.spawn(type, resolveColor(getSelectedColor())),
    onClear: () => {
      table.clear();
      if (table.mode === 'local') toast('Mesa limpia');
    },
    onResetBoard: () => {
      table.loadBoard(table.boardId);
      if (table.mode === 'local') toast('Partida reiniciada');
    },
    onRollDice: () => table.rollDice(),
    onResetView: () => rig.reset(),
    onJoin: joinSharedTable,
    onLeave: leaveSharedTable,
  });

  // 3. Raton y teclado (siempre activos como respaldo)
  initMouseInput(canvas, rig, {
    isHolding: () => !!interaction.held,
    onDelete: () => {
      // Solo en tableros con papelera (en los juegos de mesa no se borran fichas)
      if (!getBoard(table.boardId).ui.trash) return;
      if (interaction.hovered && !interaction.held) table.remove(interaction.hovered.id);
    },
  });

  // 4. Mesa local con el tablero de bloques
  localTable = new LocalTable(tableHandlers);
  table = localTable;
  table.loadBoard('free');
  setNetStatus('offline');

  // Acceso para depurar desde la consola del navegador, por ejemplo:
  //   mesa.table.boardId      mesa.table.loadBoard('chess')      mesa.rig.reset()
  window.mesa = { get table() { return table; }, rig, interaction };

  // 5. Loop principal (arranca ya; la camara se suma cuando este lista)
  requestAnimationFrame(loop);

  // 6. Camara + MediaPipe en segundo plano
  setTrackerStatus('Pidiendo acceso a la cámara…');
  initHandTracker(video)
    .then(() => {
      setTrackerStatus('Cámara lista: muestra tus manos');
      toast('¡Cámara lista! Muestra tus manos');
    })
    .catch((err) => {
      console.error(err);
      setTrackerStatus(`Sin cámara (${trackerStatus.message}). Usa el ratón.`, true);
      toast('Sin cámara: puedes jugar con el ratón');
    });
}

// ------------------------------------------------------------
// Mesa compartida (multijugador)
// ------------------------------------------------------------

/** Deja la mesa local y se une a la del servidor. */
function joinSharedTable(name) {
  if (remoteTable) return;
  resetInteraction(table);
  localTable.deactivate();
  clearViews();
  remoteTable = new RemoteTable(tableHandlers);
  table = remoteTable;
  remoteTable.connect(name);
}

/** Sale de la mesa compartida y vuelve a jugar solo (con el mismo juego). */
function leaveSharedTable() {
  if (!remoteTable) return;
  const boardId = remoteTable.boardId;
  resetInteraction(table);
  remoteTable.disconnect();
  remoteTable = null;
  cursors = {};
  clearPresence();
  clearViews();
  updatePlayers([], null, []);
  table = localTable;
  localTable.activate(boardId);
  toast('Ahora juegas solo en este computador');
}

// ------------------------------------------------------------
// Loop
// ------------------------------------------------------------

function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  // --- Entrada ---
  updateGestures();
  updateMouse(dt);
  const right = gestures.right;
  const left = gestures.left;

  // --- Mano derecha (o raton): construir la intencion ---
  const source = right.detected ? 'hand' : 'mouse';
  let intent;
  if (source === 'hand') {
    const overUI = updateHandCursor({
      visible: true,
      screen: right.cursor,
      pinching: right.pose === 'pinch',
      holding: !!interaction.held,
      hovering: !!interaction.hovered,
    });
    intent = {
      active: true,
      screen: right.cursor,
      grab: right.pose === 'pinch',
      depth: right.depth,
      roll: right.roll,
      overUI,
    };
  } else {
    updateHandCursor({ visible: false });
    intent = mouse;
  }

  // Al cambiar de fuente (aparece/desaparece la mano), soltar lo que se tenia:
  // las referencias de profundidad y giro de una fuente no sirven para la otra.
  const options = { isOverTrash, boardId: table.boardId };
  if (source !== lastSource) {
    updateInteraction({ ...intent, active: false }, camera, table, options);
    lastSource = source;
  }

  const { trashed } = updateInteraction(intent, camera, table, options);
  if (trashed) toast('Pieza eliminada');
  updateTrash(!!interaction.held, intent.active && isOverTrash(intent.screen));
  table.sendCursor(interaction.point);

  // --- Mano izquierda: camara ---
  rig.updateFromHand(left);
  rig.update();

  // --- Mesa (fisica local o estado del servidor) y render ---
  table.update(dt);
  if (remoteTable) {
    updatePresence(cursors, remoteTable.players, remoteTable.me?.id ?? null);
    animatePresence(dt);
  }
  renderScene();

  // --- Indicadores ---
  drawHands(gestures);
  updateStatus({
    mode: trackerStatus.state === 'ready' ? 'hands' : trackerStatus.state === 'loading' ? 'loading' : 'mouse',
    left,
    right,
    rightState: interaction.state,
    leftMode: rig.mode,
    resetProgress: rig.resetProgress(left),
    pieceCount: allViews().length,
  });

  requestAnimationFrame(loop);
}

main();
