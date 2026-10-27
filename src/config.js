// ============================================================
// config.js — Todos los parametros ajustables en un solo lugar
// ============================================================
// Si algo se siente "muy sensible" o "muy lento", casi siempre se
// arregla cambiando un numero de este archivo, sin tocar la logica.
//
// Unidades: 1 unidad de la escena ~ 1 cm de juguete. Un cubo mide 2.
// ============================================================

/** Mesa de juego (tablero de madera con borde). */
export const TABLE = {
  width: 32,        // largo en X
  depth: 22,        // ancho en Z
  thickness: 1,     // grosor del tablero (la cara de arriba queda en y = 0)
  rimHeight: 0.8,   // altura del borde que evita que las piezas se caigan
  rimWidth: 0.6,
};

/** Simulacion fisica (cannon-es). */
export const PHYSICS = {
  gravity: -30,         // mas fuerte que 9.8 para que la caida se vea agil a esta escala
  timeStep: 1 / 60,     // paso fijo de la simulacion (s)
  maxSubSteps: 4,       // pasos maximos por frame si el navegador se atrasa
  friction: 0.6,        // madera contra madera
  restitution: 0.05,    // casi no rebota
  fallLimitY: -15,      // si una pieza cae por debajo de esto, se elimina
  maxPieces: 40,        // limite para que la fisica no se ponga lenta
};

/** Camara orbital (mano izquierda / clic derecho). */
export const CAMERA = {
  fov: 50,
  target: { x: 0, y: 1.5, z: 0 },  // punto alrededor del cual se orbita
  radius: 36,                      // distancia inicial al objetivo
  theta: 0,                        // angulo horizontal inicial (0 = de frente)
  phi: 0.95,                       // angulo desde la vertical (0 = mirar desde arriba)
  minRadius: 14,
  maxRadius: 70,
  minPhi: 0.15,
  maxPhi: 1.45,                    // un poco antes del horizonte para no ver bajo la mesa
  smoothing: 0.18,                 // 0..1, que tan rapido la camara alcanza su objetivo
};

/** Agarre de piezas (mano derecha / clic izquierdo). */
export const GRAB = {
  positionGain: 14,     // que tan rapido la pieza sigue al cursor (1/s)
  maxSpeed: 45,         // velocidad maxima mientras se sostiene
  rotationGain: 10,     // que tan rapido la pieza alcanza la rotacion pedida
  maxThrowSpeed: 25,    // velocidad maxima al soltar (lanzar)
  depthGain: 1.6,       // sensibilidad de la profundidad (acercar/alejar la mano)
  rollGain: 1.2,        // cuanto gira la pieza por cada radian que gira la muneca
  minHeight: 0.3,       // el objetivo nunca baja de esta altura (evita hundirse en la mesa)
  maxHeight: 28,
};

/** Interpretacion de gestos de MediaPipe. */
export const GESTURE = {
  pinchIn: 0.32,        // dist(pulgar, indice) / tamano de palma para empezar pellizco
  pinchOut: 0.48,       // ... y para terminarlo (histeresis: evita parpadeo)
  extendRatio: 1.1,     // la punta debe estar 10% mas lejos de la muneca que la articulacion
  stableFrames: 3,      // frames seguidos para aceptar una pose nueva
  smoothing: 0.4,       // peso de la muestra nueva en el suavizado (0..1)
  // Zona util de la imagen: la mano casi nunca llega a los bordes de la camara,
  // asi que este rectangulo central se estira a toda la pantalla.
  activeArea: { minX: 0.12, maxX: 0.88, minY: 0.1, maxY: 0.8 },
};

/** Control de camara con la mano izquierda. */
export const LEFT_HAND = {
  orbitGain: 5,         // radianes por cada "pantalla completa" de movimiento
  zoomGain: 2.2,        // factor de zoom por cada pantalla de movimiento vertical
  resetHoldMs: 1000,    // tiempo sosteniendo la V para restablecer la vista
};

/** Seleccion de botones con la mano (mantener el cursor encima). */
export const DWELL = {
  timeMs: 900,          // tiempo sobre un boton para "hacer clic"
};

/** Raton y teclado (modo sin camara, util para probar). */
export const MOUSE = {
  orbitSpeed: 0.008,    // radianes por pixel arrastrando con clic derecho
  zoomSpeed: 0.0012,    // factor de zoom por unidad de rueda
  depthStep: 0.08,      // profundidad por cada paso de rueda mientras se sostiene una pieza
  rollSpeed: 2.5,       // radianes por segundo con Q / E
};
