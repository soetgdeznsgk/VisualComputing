// ============================================================
// app.js — Punto de entrada. Conecta los 3 modulos.
// ============================================================
// Este archivo NO le "pertenece" a nadie en particular.
// Solo importa los modulos y los conecta en el loop principal.
// Editar con cuidado y avisar al equipo si se cambia algo.
// ============================================================

import { initHandTracker, handData } from './handTracker.js';
import { updateGesture, poseData } from './gestureInterpreter.js';
import { initScene, renderFrame } from './ui.js';

async function main() {
  const videoEl = document.getElementById('webcam');
  const canvasEl = document.getElementById('canvas3d');

  // 1. Inicializar escena 3D (Persona 3)
  initScene(canvasEl);

  // 2. Inicializar camara + hand tracking (Persona 1)
  await initHandTracker(videoEl);

  // 3. Loop principal
  function loop() {
    updateGesture();       // Persona 2: landmarks -> pose + gesto
    renderFrame(poseData); // Persona 3: dibuja la escena
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

main().catch(console.error);
