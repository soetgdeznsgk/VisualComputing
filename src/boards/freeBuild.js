// ============================================================
// boards/freeBuild.js — Construccion libre con bloques de madera
// ============================================================
// El juego original: mesa vacia, caja de bloques y papelera.
// ============================================================

const STARTER_PIECES = ['cube', 'brick', 'cylinder', 'pyramid', 'arch', 'roof'];

export const freeBuild = {
  id: 'free',
  name: 'Bloques',
  ui: { buildPalette: true, trash: true, dice: false },
  camera: {}, // vista por defecto de config.js
  mat: null,  // sin tapete: la mesa de madera sola
  snap: null, // los bloques se apoyan libremente

  /** Algunos bloques al azar para empezar (caen desde arriba). */
  setup() {
    return STARTER_PIECES.map((type) => ({ type, color: 'mix' }));
  },
};
