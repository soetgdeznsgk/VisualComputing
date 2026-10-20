// ============================================================
// PERSONA 1 — Captura y deteccion de manos
// ============================================================
// Responsabilidades:
//   - Activar la webcam
//   - Inicializar MediaPipe Hands
//   - Extraer los 21 landmarks de la mano
//   - Exponer los datos en un formato limpio
//
// NO tocar: gestureInterpreter.js ni ui.js
// ============================================================

/**
 * Estado compartido — gestureInterpreter.js lee de aqui.
 * Actualizar estos valores cada frame que MediaPipe detecte una mano.
 */
export const handData = {
  landmarks: [],    // array de 21 objetos { x, y, z } normalizados 0..1
  handedness: '',   // 'Left' | 'Right'
  detected: false,  // true cuando hay mano visible
};

/**
 * Inicializa la webcam y el modelo de MediaPipe Hands.
 * @param {HTMLVideoElement} videoEl — el elemento <video> del DOM
 * @returns {Promise<void>}
 *
 * TODO Persona 1:
 *   1. Pedir acceso a la camara con navigator.mediaDevices.getUserMedia
 *   2. Asignar el stream al videoEl
 *   3. Crear la instancia de MediaPipe Hands
 *   4. En cada frame de resultados, actualizar handData
 */
export async function initHandTracker(videoEl) {
  // --- SIMULACION (borrar cuando este lista la camara) ---
  console.log('[handTracker] usando datos simulados');
  function simulate() {
    const t = performance.now() / 1000;
    handData.detected = true;
    handData.handedness = 'Right';
    // Simula el dedo indice moviéndose
    handData.landmarks = Array.from({ length: 21 }, (_, i) => ({
      x: 0.5 + 0.3 * Math.sin(t * 0.7 + i * 0.1),
      y: 0.5 + 0.2 * Math.cos(t * 1.3 + i * 0.1),
      z: 0.01 * Math.sin(t * 0.5),
    }));
    requestAnimationFrame(simulate);
  }
  simulate();
  // --- FIN SIMULACION ---
}

/**
 * Detiene la camara y libera recursos.
 */
export function stopHandTracker() {
  // TODO Persona 1: detener el stream de la camara
}
