// ============================================================
// ui.js — Interfaz: paneles, cursor de la mano y papelera
// ============================================================
// Responsabilidades:
//   - Crear las pestanas de tableros y los botones de piezas y colores
//   - Mostrar u ocultar paneles segun el tablero (setBoardUI)
//   - Mostrar el resultado de los dados
//   - "Presionar" botones con la mano: mantener el cursor encima un
//     momento (dwell). Cualquier boton con la clase .dwellable funciona.
//   - Mostrar el estado de cada mano y el modo (manos / raton)
//   - Dibujar el esqueleto de las manos sobre el video
//   - Detectar si el cursor esta sobre la papelera
//   - Mensajes cortos (toast)
// ============================================================

import { BUILD_PIECES, COLORS } from './pieceCatalog.js';
import { BOARDS } from './boards/index.js';
import { DWELL, PHYSICS } from './config.js';

const $ = (sel) => document.querySelector(sel);

let selectedColor = 'mix';

/** Color elegido actualmente (id de COLORS). */
export function getSelectedColor() {
  return selectedColor;
}

/**
 * Crea los botones y conecta sus acciones.
 * @param {object} actions
 * @param {(boardId:string) => void} actions.onSelectBoard
 * @param {(type:string) => void} actions.onSpawn
 * @param {() => void} actions.onClear
 * @param {() => void} actions.onResetBoard
 * @param {() => void} actions.onRollDice
 * @param {() => void} actions.onResetView
 */
export function initUI({ onSelectBoard, onSpawn, onClear, onResetBoard, onRollDice, onResetView }) {
  // Pestanas de tableros
  const tabs = $('#board-tabs');
  BOARDS.forEach((b) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'board-tab dwellable';
    btn.dataset.board = b.id;
    btn.setAttribute('role', 'tab');
    btn.textContent = b.name;
    btn.addEventListener('click', () => onSelectBoard(b.id));
    tabs.appendChild(btn);
  });

  // Botones de piezas (solo los bloques de construccion)
  const grid = $('#piece-grid');
  BUILD_PIECES.forEach((p) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'piece-btn dwellable';
    btn.title = p.name;
    btn.innerHTML = `<svg viewBox="0 0 40 40" aria-hidden="true">${p.icon}</svg><span>${p.name}</span>`;
    btn.addEventListener('click', () => onSpawn(p.id));
    grid.appendChild(btn);
  });

  // Muestras de color
  const row = $('#color-row');
  COLORS.forEach((c) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch dwellable';
    btn.title = c.name;
    btn.dataset.color = c.id;
    btn.style.background = c.hex ?? 'conic-gradient(#d9473b, #f2c230, #4fa35a, #3a78c9, #8c5bb5, #d9473b)';
    btn.classList.toggle('selected', c.id === selectedColor);
    btn.addEventListener('click', () => {
      selectedColor = c.id;
      row.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('selected', s === btn));
    });
    row.appendChild(btn);
  });

  $('#btn-clear').addEventListener('click', onClear);
  $('#btn-reset').addEventListener('click', onResetBoard);
  $('#btn-roll').addEventListener('click', onRollDice);
  $('#btn-view').addEventListener('click', onResetView);
}

/**
 * Adapta los paneles al tablero actual (que secciones y botones se ven).
 * @param {object} board — definicion de boards/index.js
 */
export function setBoardUI(board) {
  document.querySelectorAll('.board-tab').forEach((t) => {
    const active = t.dataset.board === board.id;
    t.classList.toggle('selected', active);
    t.setAttribute('aria-selected', String(active));
  });
  $('#build-section').hidden = !board.ui.buildPalette;
  $('#dice-section').hidden = !board.ui.dice;
  $('#btn-clear').hidden = !board.ui.buildPalette;
  $('#btn-reset').hidden = board.ui.buildPalette;
  $('#trash').hidden = !board.ui.trash;
  $('#dice-last').textContent = 'Lanza los dados para empezar';
  $('#dice-result').classList.remove('visible');
}

// ------------------------------------------------------------
// Resultado de los dados
// ------------------------------------------------------------

let diceTimer = null;

/** Muestra el resultado de los dados en grande unos segundos y en el panel. */
export function showDiceResult({ values, total, doubles, cocked }) {
  if (cocked) {
    $('#dice-last').textContent = 'Un dado quedó inclinado: vuelve a lanzar';
    toast('Un dado quedó inclinado: vuelve a lanzar');
    return;
  }
  const text = `${values.join(' + ')} = ${total}`;
  $('#dice-last').textContent = `Última tirada: ${text}${doubles ? ' (pares)' : ''}`;

  const el = $('#dice-result');
  el.innerHTML = `
    <div class="dice-faces">${values.map((v) => `<span class="die-face">${v}</span>`).join('')}</div>
    <div class="dice-total">${total}</div>
    ${doubles ? '<div class="dice-doubles">¡Pares!</div>' : ''}`;
  el.classList.add('visible');
  clearTimeout(diceTimer);
  diceTimer = setTimeout(() => el.classList.remove('visible'), 3500);
}

// ------------------------------------------------------------
// Cursor de la mano y seleccion por permanencia (dwell)
// ------------------------------------------------------------

const dwell = {
  element: null,  // boton bajo el cursor
  start: 0,       // cuando llego el cursor a ese boton
  fired: false,   // ya se presiono (no repetir hasta salir y volver)
};

/**
 * Actualiza el cursor de la mano derecha y el dwell sobre botones.
 * @param {object} p
 * @param {boolean} p.visible — mostrar el cursor (hay mano derecha)
 * @param {{x,y}} p.screen — posicion 0..1
 * @param {boolean} p.pinching — la mano esta en pellizco
 * @param {boolean} p.holding — hay una pieza agarrada
 * @param {boolean} p.hovering — el cursor esta sobre una pieza
 * @returns {boolean} si el cursor esta sobre la interfaz (para no agarrar piezas a traves de ella)
 */
export function updateHandCursor({ visible, screen, pinching, holding, hovering }) {
  const cursor = $('#hand-cursor');
  cursor.classList.toggle('visible', visible);
  if (!visible) {
    resetDwell();
    return false;
  }

  const px = screen.x * window.innerWidth;
  const py = screen.y * window.innerHeight;
  cursor.style.transform = `translate(${px}px, ${py}px)`;
  cursor.classList.toggle('pinching', pinching);
  cursor.classList.toggle('holding', holding);
  cursor.classList.toggle('hovering', hovering && !holding);

  // El cursor tiene pointer-events: none, asi que esto devuelve lo que hay debajo.
  const under = document.elementFromPoint(px, py);
  const overUI = !!under?.closest('.panel');
  const target = holding ? null : under?.closest('.dwellable') ?? null;

  if (target !== dwell.element) {
    dwell.element?.classList.remove('dwell-target');
    dwell.element = target;
    dwell.start = performance.now();
    dwell.fired = false;
    target?.classList.add('dwell-target');
  }

  let progress = 0;
  if (dwell.element && !dwell.fired) {
    progress = Math.min(1, (performance.now() - dwell.start) / DWELL.timeMs);
    if (progress >= 1) {
      dwell.fired = true;
      dwell.element.click();
      flash(dwell.element);
      progress = 0;
    }
  }
  cursor.style.setProperty('--progress', progress.toFixed(3));
  return overUI;
}

function resetDwell() {
  dwell.element?.classList.remove('dwell-target');
  dwell.element = null;
  dwell.fired = false;
  $('#hand-cursor').style.setProperty('--progress', 0);
}

/** Pequena animacion al presionar un boton con la mano. */
function flash(el) {
  el.classList.remove('flash');
  void el.offsetWidth; // reinicia la animacion CSS
  el.classList.add('flash');
}

// ------------------------------------------------------------
// Papelera
// ------------------------------------------------------------

/** Si un punto de la pantalla (0..1) esta sobre la papelera. */
export function isOverTrash(screen) {
  const trash = $('#trash');
  if (trash.hidden) return false; // este tablero no tiene papelera
  const r = trash.getBoundingClientRect();
  const x = screen.x * window.innerWidth;
  const y = screen.y * window.innerHeight;
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

/** Resalta la papelera mientras se lleva una pieza (y mas si esta encima). */
export function updateTrash(holding, over) {
  const t = $('#trash');
  t.classList.toggle('armed', holding);
  t.classList.toggle('over', holding && over);
}

// ------------------------------------------------------------
// Estado de las manos
// ------------------------------------------------------------

const POSE_NAMES = {
  none: '—',
  open: 'Mano abierta',
  fist: 'Puño',
  pinch: 'Pellizco',
  point: 'Apuntando',
  v: 'V',
};

const RIGHT_ACTIONS = {
  idle: 'Apunta a una pieza',
  hover: 'Pellizca para agarrar',
  holding: 'Moviendo pieza',
};

const LEFT_ACTIONS = {
  idle: 'Cierra el puño para girar',
  orbit: 'Girando la vista',
  zoom: 'Zoom',
};

/**
 * Actualiza los indicadores de estado.
 * @param {object} s
 * @param {'hands'|'mouse'|'loading'} s.mode
 * @param {object} s.left  — gesto de la mano izquierda
 * @param {object} s.right — gesto de la mano derecha
 * @param {string} s.rightState — interaction.state
 * @param {string} s.leftMode — rig.mode
 * @param {number} s.resetProgress — 0..1 de la V para restablecer vista
 * @param {number} s.pieceCount
 */
export function updateStatus(s) {
  const badge = $('#mode-badge');
  badge.textContent = { hands: 'Manos', mouse: 'Ratón', loading: 'Cargando…' }[s.mode];
  badge.dataset.mode = s.mode;

  setChip('#chip-left', s.left, s.left.detected
    ? (s.resetProgress > 0 ? `Restableciendo vista ${Math.round(s.resetProgress * 100)}%` : LEFT_ACTIONS[s.leftMode])
    : 'No detectada');
  setChip('#chip-right', s.right, s.right.detected ? RIGHT_ACTIONS[s.rightState] : 'No detectada');

  $('#piece-count').textContent = `Piezas en la mesa: ${s.pieceCount} / ${PHYSICS.maxPieces}`;
}

function setChip(sel, g, action) {
  const chip = $(sel);
  chip.classList.toggle('active', g.detected);
  chip.querySelector('.hand-pose').textContent = POSE_NAMES[g.pose] ?? g.pose;
  chip.querySelector('.hand-action').textContent = action;
}

/** Texto bajo el video (estado de la camara). */
export function setTrackerStatus(text, isError = false) {
  const el = $('#tracker-status');
  el.textContent = text;
  el.classList.toggle('error', isError);
}

// ------------------------------------------------------------
// Esqueleto de las manos sobre el video
// ------------------------------------------------------------

// Pares de landmarks unidos por "huesos"
const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],         // pulgar
  [0, 5], [5, 6], [6, 7], [7, 8],         // indice
  [5, 9], [9, 10], [10, 11], [11, 12],    // medio
  [9, 13], [13, 14], [14, 15], [15, 16],  // anular
  [13, 17], [17, 18], [18, 19], [19, 20], // menique
  [0, 17],
];
const HAND_COLORS = { left: '#4cc9f0', right: '#f8961e' };

/** Dibuja el esqueleto de ambas manos sobre el video. */
export function drawHands(gestures) {
  const canvas = $('#hand-overlay');
  const video = $('#webcam');
  // El canvas copia el tamano mostrado del video
  const w = video.clientWidth, h = video.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  for (const side of ['left', 'right']) {
    const g = gestures[side];
    if (!g.detected) continue;
    const lm = g.landmarks;
    ctx.strokeStyle = HAND_COLORS[side];
    ctx.fillStyle = HAND_COLORS[side];
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [a, b] of BONES) {
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
    }
    ctx.stroke();
    for (const p of lm) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ------------------------------------------------------------
// Mensajes
// ------------------------------------------------------------

let toastTimer = null;

/** Muestra un mensaje corto unos segundos. */
export function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2200);
}
