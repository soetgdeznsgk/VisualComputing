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

// MediaPipe Hands (legacy) no es un modulo ES: es un script que define
// window.Hands y luego descarga sus .wasm / .tflite. Importarlo con Vite
// falla en el build, asi que lo cargamos desde el CDN con la misma version
// que esta en package.json.
const MP_VERSION = '0.4.1675469240';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${MP_VERSION}`;

/**
 * Estado compartido — gestureInterpreter.js lee de aqui.
 * Se actualiza cada frame que MediaPipe procesa.
 *
 * Con selfieMode activado las coordenadas ya vienen en espejo:
 * mover la mano a la derecha aumenta x (como en un espejo), y
 * handedness corresponde a la mano real del usuario.
 */
export const handData = {
  landmarks: [],    // array de 21 objetos { x, y, z } normalizados 0..1
  handedness: '',   // 'Left' | 'Right'
  detected: false,  // true cuando hay mano visible
};

let stream = null;
let hands = null;
let rafId = null;
let running = false;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(s);
  });
}

function onResults(results) {
  const lms = results.multiHandLandmarks;
  if (!lms || lms.length === 0) {
    handData.detected = false;
    handData.landmarks = [];
    handData.handedness = '';
    return;
  }
  // maxNumHands = 1, asi que solo usamos la primera mano
  handData.landmarks = lms[0].map(({ x, y, z }) => ({ x, y, z }));
  handData.handedness = results.multiHandedness?.[0]?.label ?? '';
  handData.detected = true;
}

/**
 * Inicializa la webcam y el modelo de MediaPipe Hands.
 * @param {HTMLVideoElement} videoEl — el elemento <video> del DOM
 * @returns {Promise<void>}
 */
export async function initHandTracker(videoEl) {
  // 1. Camara
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('[handTracker] getUserMedia no disponible (usa https o localhost)');
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
  } catch (err) {
    throw new Error(`[handTracker] sin acceso a la camara: ${err.message}`);
  }

  // 2. Preview en el <video> (en espejo, igual que los landmarks)
  videoEl.srcObject = stream;
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.style.transform = 'scaleX(-1)';
  await new Promise((resolve) => {
    if (videoEl.readyState >= 2) return resolve();
    videoEl.onloadeddata = () => resolve();
  });
  await videoEl.play();

  // 3. MediaPipe Hands
  await loadScript(`${MP_BASE}/hands.js`);
  hands = new window.Hands({ locateFile: (file) => `${MP_BASE}/${file}` });
  hands.setOptions({
    selfieMode: true,
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  hands.onResults(onResults);
  await hands.initialize();

  // 4. Loop: mandar cada frame nuevo del video a MediaPipe.
  // Se espera a que termine send() antes del siguiente para no encolar frames.
  running = true;
  let lastTime = -1;
  async function processFrame() {
    if (!running) return;
    if (videoEl.readyState >= 2 && videoEl.currentTime !== lastTime) {
      lastTime = videoEl.currentTime;
      try {
        await hands.send({ image: videoEl });
      } catch (err) {
        console.error('[handTracker] error procesando frame', err);
      }
    }
    if (running) rafId = requestAnimationFrame(processFrame);
  }
  processFrame();

  console.log('[handTracker] camara + MediaPipe Hands listos');
}

/**
 * Detiene la camara y libera recursos.
 */
export function stopHandTracker() {
  running = false;
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;

  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (hands) {
    hands.close();
    hands = null;
  }

  handData.detected = false;
  handData.landmarks = [];
  handData.handedness = '';
}
