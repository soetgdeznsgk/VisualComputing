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
  cell: 1,
  snapPoints: [],
  createMat: null,

  /** Algunos bloques al azar para empezar (caen desde arriba). */
  setup() {
    return STARTER_PIECES.map((type) => ({ type, color: 'mix' }));
  },
};
