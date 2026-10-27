// ============================================================
// handTracker.js — Camara + deteccion de manos (MediaPipe Hands)
// ============================================================
// Responsabilidades:
//   - Encender la webcam y mostrarla en el <video>
//   - Correr MediaPipe Hands sobre cada frame (hasta 2 manos)
//   - Exponer los 21 landmarks de cada mano en `hands.left` / `hands.right`
//
// No interpreta gestos: eso lo hace gestureInterpreter.js.
//
// Referencia de landmarks (indices de MediaPipe):
//   0 muneca | 1-4 pulgar | 5-8 indice | 9-12 medio | 13-16 anular | 17-20 menique
//   (en cada dedo el ultimo indice es la punta: 4, 8, 12, 16, 20)
// ============================================================

// MediaPipe Hands (legacy) no es un modulo ES: es un script que define
// window.Hands y luego descarga sus .wasm / .tflite. Importarlo con Vite
// falla en el build, asi que lo cargamos desde el CDN con la misma version
// que esta en package.json.
const MP_VERSION = '0.4.1675469240';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${MP_VERSION}`;

/**
 * Estado compartido: se actualiza cada vez que MediaPipe procesa un frame.
 *
 * Coordenadas de cada landmark { x, y, z }:
 *   x: 0 (izquierda de la pantalla) .. 1 (derecha). Ya vienen en espejo
 *      (selfieMode), asi que mover la mano a tu derecha aumenta x.
 *   y: 0 (arriba) .. 1 (abajo).
 *   z: profundidad relativa a la muneca (negativo = mas cerca de la camara).
 *
 * `left` / `right` se refieren a la mano real del usuario.
 */
export const hands = {
  left: { detected: false, landmarks: [] },
  right: { detected: false, landmarks: [] },
};

/** 'off' | 'loading' | 'ready' | 'error' — la interfaz lo muestra. */
export const trackerStatus = { state: 'off', message: '' };

let stream = null;
let mpHands = null;
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

function clearHand(hand) {
  hand.detected = false;
  hand.landmarks = [];
}

/**
 * Callback de MediaPipe. Reparte las manos detectadas en left/right.
 * Si MediaPipe etiqueta las dos manos igual (pasa a veces cuando se
 * cruzan), la segunda se asigna al lado que quedo libre.
 */
function onResults(results) {
  const list = results.multiHandLandmarks ?? [];
  const labels = results.multiHandedness ?? [];
  const filled = { left: false, right: false };

  list.forEach((lms, i) => {
    let side = labels[i]?.label === 'Left' ? 'left' : 'right';
    if (filled[side]) side = side === 'left' ? 'right' : 'left';
    if (filled[side]) return; // mas de 2 manos: se ignora
    filled[side] = true;
    hands[side].landmarks = lms.map(({ x, y, z }) => ({ x, y, z }));
    hands[side].detected = true;
  });

  if (!filled.left) clearHand(hands.left);
  if (!filled.right) clearHand(hands.right);
}

/**
 * Enciende la webcam y MediaPipe Hands.
 * Lanza un Error si no hay camara o el usuario niega el permiso;
 * app.js lo captura y sigue en modo raton.
 * @param {HTMLVideoElement} videoEl
 */
export async function initHandTracker(videoEl) {
  trackerStatus.state = 'loading';
  trackerStatus.message = 'Pidiendo acceso a la camara...';

  try {
    // 1. Camara
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('getUserMedia no disponible (abre la app en localhost o https)');
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
    } catch (err) {
      throw new Error(`sin acceso a la camara: ${err.message}`);
    }

    // 2. Preview en el <video>. El espejo se hace en CSS (#webcam) para que
    //    coincida con los landmarks, que ya vienen en espejo.
    videoEl.srcObject = stream;
    videoEl.muted = true;
    videoEl.playsInline = true;
    await new Promise((resolve) => {
      if (videoEl.readyState >= 2) return resolve();
      videoEl.onloadeddata = () => resolve();
    });
    await videoEl.play();

    // 3. MediaPipe Hands
    trackerStatus.message = 'Cargando modelo de manos...';
    await loadScript(`${MP_BASE}/hands.js`);
    mpHands = new window.Hands({ locateFile: (file) => `${MP_BASE}/${file}` });
    mpHands.setOptions({
      selfieMode: true,      // coordenadas en espejo + handedness de la mano real
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });
    mpHands.onResults(onResults);
    await mpHands.initialize();
  } catch (err) {
    trackerStatus.state = 'error';
    trackerStatus.message = err.message;
    stopHandTracker();
    throw new Error(`[handTracker] ${err.message}`);
  }

  // 4. Loop: mandar cada frame nuevo del video a MediaPipe.
  //    Se espera a que termine send() antes del siguiente para no encolar frames.
  running = true;
  let lastTime = -1;
  async function processFrame() {
    if (!running) return;
    if (videoEl.readyState >= 2 && videoEl.currentTime !== lastTime) {
      lastTime = videoEl.currentTime;
      try {
        await mpHands.send({ image: videoEl });
      } catch (err) {
        console.error('[handTracker] error procesando frame', err);
      }
    }
    if (running) rafId = requestAnimationFrame(processFrame);
  }
  processFrame();

  trackerStatus.state = 'ready';
  trackerStatus.message = 'Camara lista';
  console.log('[handTracker] camara + MediaPipe Hands listos (2 manos)');
}

/** Detiene la camara y libera recursos. */
export function stopHandTracker() {
  running = false;
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;

  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (mpHands) {
    mpHands.close();
    mpHands = null;
  }
  clearHand(hands.left);
  clearHand(hands.right);
}
