// ============================================================
// mouseInput.js — Control con raton y teclado
// ============================================================
// Alternativa a las manos: sirve para probar sin camara y como respaldo
// si la deteccion falla. Equivalencias:
//
//   Mano derecha (piezas)            Raton / teclado
//   ---------------------            ---------------
//   mover el cursor                  mover el raton
//   pellizco = agarrar               clic izquierdo sostenido
//   acercar/alejar la mano           rueda (mientras se sostiene una pieza)
//   girar la muneca                  Q / E (mientras se sostiene una pieza)
//
//   Mano izquierda (camara)
//   puno + mover = girar vista       clic derecho + arrastrar
//   pellizco + subir/bajar = zoom    rueda (sin pieza agarrada)
//   V sostenida = restablecer        tecla R
//
//   Supr / Backspace: elimina la pieza bajo el cursor
// ============================================================

import { MOUSE } from './config.js';

/**
 * Estado del raton con el mismo formato que la intencion de la mano
 * (ver PointerIntent en interaction.js).
 */
export const mouse = {
  active: false,
  screen: { x: 0.5, y: 0.5 },
  grab: false,
  depth: 0,
  roll: 0,
  overUI: false,
};

const keys = new Set();

/**
 * Registra los eventos del raton y teclado.
 * @param {HTMLCanvasElement} canvas
 * @param {import('./cameraRig.js').CameraRig} rig
 * @param {object} hooks
 * @param {() => boolean} hooks.isHolding — hay una pieza agarrada
 * @param {() => void} hooks.onDelete — eliminar pieza bajo el cursor
 */
export function initMouseInput(canvas, rig, { isHolding, onDelete }) {
  let orbiting = false;
  let last = { x: 0, y: 0 };

  window.addEventListener('pointermove', (e) => {
    mouse.screen.x = e.clientX / window.innerWidth;
    mouse.screen.y = e.clientY / window.innerHeight;
    // overUI: el puntero esta sobre algo que no es el canvas (panel, boton...)
    mouse.overUI = e.target !== canvas;
    mouse.active = true;

    if (orbiting) {
      rig.orbit(-(e.clientX - last.x) * MOUSE.orbitSpeed, -(e.clientY - last.y) * MOUSE.orbitSpeed);
      last = { x: e.clientX, y: e.clientY };
    }
  });

  document.addEventListener('pointerleave', () => { mouse.active = false; });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 0) mouse.grab = true;
    if (e.button === 2) {
      orbiting = true;
      last = { x: e.clientX, y: e.clientY };
    }
    canvas.setPointerCapture(e.pointerId);
  });

  window.addEventListener('pointerup', (e) => {
    if (e.button === 0) mouse.grab = false;
    if (e.button === 2) orbiting = false;
  });

  // Sin menu contextual en el canvas (el clic derecho es para girar)
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (isHolding()) {
      // Rueda hacia arriba (deltaY < 0) empuja la pieza hacia el fondo
      mouse.depth += -Math.sign(e.deltaY) * MOUSE.depthStep;
    } else {
      rig.zoom(Math.exp(e.deltaY * MOUSE.zoomSpeed));
    }
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    keys.add(key);
    if (key === 'r') rig.reset();
    if (key === 'delete' || key === 'backspace') onDelete();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.grab = false;
    orbiting = false;
  });
}

/** Llamar cada frame: Q / E giran la pieza agarrada de forma continua. */
export function updateMouse(dt) {
  if (keys.has('e')) mouse.roll += MOUSE.rollSpeed * dt;
  if (keys.has('q')) mouse.roll -= MOUSE.rollSpeed * dt;
}
