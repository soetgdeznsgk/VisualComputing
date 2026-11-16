// ============================================================
// boards/gridLayout.js — Tableros de cuadricula (ajedrez, damas, triki)
// ============================================================
// Solo DATOS (sin canvas), para que el servidor tambien los use.
// Un tablero de N x N casillas de lado `cell`, centrado en el origen.
// La fila 0 queda al fondo (-Z) y la ultima cerca de la camara (+Z).
// ============================================================

/**
 * @param {number} n — casillas por lado
 * @param {number} cell — lado de una casilla en unidades de la escena
 */
export function gridLayout(n, cell) {
  const size = n * cell;
  /** Centro de la casilla (col, row) en el mundo. */
  const cellToWorld = (col, row) => ({
    x: (col + 0.5) * cell - size / 2,
    z: (row + 0.5) * cell - size / 2,
  });
  const points = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) points.push(cellToWorld(col, row));
  }
  return { n, cell, size, cellToWorld, points };
}
