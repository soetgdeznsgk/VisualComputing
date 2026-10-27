// ============================================================
// cameraRig.js — Camara orbital controlada con la mano izquierda
// ============================================================
// La camara gira alrededor de un punto de la mesa usando coordenadas
// esfericas (radio, theta, phi). Se puede mover con:
//   - Mano izquierda:  puno + mover   -> girar la vista
//                      pellizco + subir/bajar -> zoom
//                      V sostenida    -> restablecer la vista
//   - Raton:           clic derecho + arrastrar -> girar, rueda -> zoom
//
// Los controles cambian un valor "deseado" y la camara real lo alcanza
// poco a poco (suavizado), asi el movimiento no da saltos.
// ============================================================

import * as THREE from 'three';
import { CAMERA, LEFT_HAND } from './config.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class CameraRig {
  /** @param {THREE.PerspectiveCamera} camera */
  constructor(camera) {
    this.camera = camera;
    this.target = new THREE.Vector3(CAMERA.target.x, CAMERA.target.y, CAMERA.target.z);
    this.desired = { radius: CAMERA.radius, theta: CAMERA.theta, phi: CAMERA.phi };
    this.current = { ...this.desired };

    // Estado de la mano izquierda
    this.mode = 'idle';      // 'idle' | 'orbit' | 'zoom' — para mostrar en la interfaz
    this._anchor = null;     // posicion de la palma en el frame anterior
    this._resetDone = false; // la V ya restablecio la vista (una vez por gesto)

    this._apply();
  }

  /** Girar la vista (radianes). theta = horizontal, phi = vertical. */
  orbit(dTheta, dPhi) {
    this.desired.theta += dTheta;
    this.desired.phi = clamp(this.desired.phi + dPhi, CAMERA.minPhi, CAMERA.maxPhi);
  }

  /** Zoom multiplicativo: factor > 1 aleja, < 1 acerca. */
  zoom(factor) {
    this.desired.radius = clamp(this.desired.radius * factor, CAMERA.minRadius, CAMERA.maxRadius);
  }

  /** Vuelve a la vista inicial (por el camino mas corto en theta). */
  reset() {
    const turns = Math.round(this.desired.theta / (Math.PI * 2));
    this.desired = { radius: CAMERA.radius, theta: CAMERA.theta + turns * Math.PI * 2, phi: CAMERA.phi };
  }

  /**
   * Aplica los gestos de la mano izquierda (de gestureInterpreter.js).
   * Funciona como "agarrar el mundo": mientras el puno esta cerrado, el
   * movimiento de la mano gira la escena; al abrirla se suelta, igual que
   * levantar el raton de la mesa para reacomodarlo.
   */
  updateFromHand(g) {
    if (!g.detected) {
      this.mode = 'idle';
      this._anchor = null;
      return;
    }

    const mode = g.pose === 'fist' ? 'orbit' : g.pose === 'pinch' ? 'zoom' : 'idle';
    // Al cambiar de modo se reinicia el ancla para no aplicar un salto.
    if (mode !== this.mode || g.poseChanged) this._anchor = { ...g.palm };
    this.mode = mode;

    if (mode !== 'idle' && this._anchor) {
      const dx = g.palm.x - this._anchor.x;
      const dy = g.palm.y - this._anchor.y;
      if (mode === 'orbit') {
        // Mover la mano a la derecha gira la mesa hacia la derecha
        this.orbit(-dx * LEFT_HAND.orbitGain, -dy * LEFT_HAND.orbitGain * 0.6);
      } else {
        // Subir la mano acerca, bajarla aleja
        this.zoom(Math.exp(dy * LEFT_HAND.zoomGain));
      }
      this._anchor = { ...g.palm };
    }

    // V sostenida = restablecer vista (una sola vez por gesto)
    if (g.pose === 'v') {
      if (!this._resetDone && performance.now() - g.poseSince > LEFT_HAND.resetHoldMs) {
        this.reset();
        this._resetDone = true;
      }
    } else {
      this._resetDone = false;
    }
  }

  /** Progreso 0..1 de la V para restablecer (para la interfaz). */
  resetProgress(g) {
    if (!g.detected || g.pose !== 'v' || this._resetDone) return 0;
    return clamp((performance.now() - g.poseSince) / LEFT_HAND.resetHoldMs, 0, 1);
  }

  /** Llamar cada frame: acerca la camara real a la deseada. */
  update() {
    const k = CAMERA.smoothing;
    this.current.radius += (this.desired.radius - this.current.radius) * k;
    this.current.theta += (this.desired.theta - this.current.theta) * k;
    this.current.phi += (this.desired.phi - this.current.phi) * k;
    this._apply();
  }

  _apply() {
    const { radius, theta, phi } = this.current;
    // Esfericas -> cartesianas (theta = 0 mira la mesa de frente, desde +Z)
    this.camera.position.set(
      this.target.x + radius * Math.sin(phi) * Math.sin(theta),
      this.target.y + radius * Math.cos(phi),
      this.target.z + radius * Math.sin(phi) * Math.cos(theta),
    );
    this.camera.lookAt(this.target);
  }
}
