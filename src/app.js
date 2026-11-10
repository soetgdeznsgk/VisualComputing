// ============================================================
// app.js — Punto de entrada: conecta todos los modulos
// ============================================================
// Flujo de cada frame:
//
//   camara ──> handTracker ──> gestureInterpreter ──┬─> cameraRig   (mano izquierda)
//                                                   └─> interaction (mano derecha)
//   raton/teclado (mouseInput) ─────────────────────┘   (si no hay mano derecha)
//
//   interaction ──> physics (cannon-es) ──> pieces (copia a Three.js) ──> render
//        └─> snapping (fichas en casillas)        └─> dice (lee el resultado)
//
// El tablero actual (bloques libres, parques...) lo carga boardManager.js
// desde las definiciones de boards/.
//
// Si la camara no esta disponible (permiso negado, sin webcam), la app
// sigue funcionando con el raton.
// ============================================================

import { initHandTracker, trackerStatus } from './handTracker.js';
import { updateGestures, gestures } from './gestureInterpreter.js';
import { initScene, camera, renderScene } from './scene.js';
import { CameraRig } from './cameraRig.js';
import { stepPhysics } from './physics.js';
import { spawnPiece, removePiece, clearPieces, syncPieces, pieces } from './pieces.js';
import { interaction, updateInteraction } from './interaction.js';
import { mouse, initMouseInput, updateMouse } from './mouseInput.js';
import { loadBoard, boardState } from './boardManager.js';
import { updateDice, rollDice } from './dice.js';
import {
  initUI, setBoardUI, getSelectedColor, updateHandCursor, updateStatus, updateTrash,
  isOverTrash, drawHands, setTrackerStatus, showDiceResult, toast,
} from './ui.js';

let rig;
let lastSource = null;  // 'hand' | 'mouse' — quien controla la mano derecha
let lastTime = performance.now();

function main() {
  const canvas = document.getElementById('canvas3d');
  const video = document.getElementById('webcam');

  // 1. Escena, camara y fisica
  initScene(canvas);
  rig = new CameraRig(camera);

  // 2. Interfaz
  initUI({
    onSelectBoard: (id) => {
      if (boardState.current?.id === id) return;
      selectBoard(id);
      toast(`Juego: ${boardState.current.name}`);
    },
    onSpawn: (type) => {
      if (!spawnPiece(type, getSelectedColor())) toast('Llegaste al límite de piezas: elimina algunas');
    },
    onClear: () => {
      clearPieces();
      toast('Mesa limpia');
    },
    onResetBoard: () => {
      selectBoard(boardState.current.id);
      toast('Partida reiniciada');
    },
    onRollDice: () => {
      const zone = boardState.current?.diceZone;
      if (zone) rollDice(zone, interaction.held);
    },
    onResetView: () => rig.reset(),
  });

  // 3. Raton y teclado (siempre activos como respaldo)
  initMouseInput(canvas, rig, {
    isHolding: () => !!interaction.held,
    onDelete: () => {
      // Solo en tableros con papelera (en parques no se borran fichas)
      if (!boardState.current?.ui.trash) return;
      if (interaction.hovered && !interaction.held) removePiece(interaction.hovered);
    },
  });

  // Tablero inicial: construccion libre
  selectBoard('free');

  // 4. Loop principal (arranca ya; la camara se suma cuando este lista)
  requestAnimationFrame(loop);

  // 5. Camara + MediaPipe en segundo plano
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

/** Carga un tablero y adapta la interfaz. */
function selectBoard(id) {
  const board = loadBoard(id, rig);
  setBoardUI(board);
}

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
  if (source !== lastSource) {
    updateInteraction({ ...intent, active: false }, camera, isOverTrash);
    lastSource = source;
  }

  const { trashed } = updateInteraction(intent, camera, isOverTrash);
  if (trashed) toast('Pieza eliminada');
  updateTrash(!!interaction.held, intent.active && isOverTrash(intent.screen));

  // --- Mano izquierda: camara ---
  rig.updateFromHand(left);
  rig.update();

  // --- Fisica y render ---
  stepPhysics();
  if (syncPieces() > 0) toast('Una pieza cayó de la mesa');
  const roll = updateDice(interaction.held);
  if (roll) showDiceResult(roll);
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
    pieceCount: pieces.length,
  });

  requestAnimationFrame(loop);
}

main();
