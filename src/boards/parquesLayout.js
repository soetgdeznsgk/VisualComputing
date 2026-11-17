// ============================================================
// boards/parquesLayout.js — Geometria del tablero de parques
// ============================================================
// Solo DATOS (sin Three.js ni canvas), para poder reutilizarlo despues
// en el servidor del multijugador.
//
// El tablero es una cuadricula de 19 x 19 casillas con forma de cruz:
//
//        NW (carcel)   | brazo N |   NE (carcel)
//        --------------+---------+--------------
//          brazo W     |  cielo  |    brazo E
//        --------------+---------+--------------
//        SW (carcel)   | brazo S |   SE (carcel)
//
// Cada brazo mide 3 casillas de ancho x 8 de largo:
//   - Las dos columnas de afuera son RECORRIDO (8 + 8) y la punta del
//     medio tambien (1): 17 casillas por brazo -> 17 x 4 = 68 casillas,
//     como el parques colombiano.
//   - La columna del medio (7 casillas) es la LLEGADA de ese color, que
//     lleva al cielo (centro).
//
// Coordenadas: casilla (i, j) con i = columna (oeste -> este) y
// j = fila (norte -> sur). En el mundo 3D, +X es el este y +Z el sur
// (hacia la camara inicial).
// ============================================================

export const GRID = 19;           // casillas por lado
export const BOARD_SIZE = 20;     // lado del tablero en unidades de la escena
export const CELL = BOARD_SIZE / GRID;

/**
 * Jugadores: cada uno es dueno de un brazo (su llegada) y de la carcel
 * de la esquina que queda junto a su casilla de salida.
 */
// `jail` es el centro de la esquina de 8 x 8 casillas (coordenadas continuas).
export const PLAYERS = [
  { id: 'yellow', name: 'Amarillo', hex: '#f2c230', arm: 'N', jail: { i: 15, j: 4 } },
  { id: 'blue', name: 'Azul', hex: '#3a78c9', arm: 'E', jail: { i: 15, j: 15 } },
  { id: 'red', name: 'Rojo', hex: '#d9473b', arm: 'S', jail: { i: 4, j: 15 } },
  { id: 'green', name: 'Verde', hex: '#4fa35a', arm: 'W', jail: { i: 4, j: 4 } },
];

/** Indices dentro de cada brazo (0..16) con significado especial. */
export const SEGMENT = {
  safe: 4,      // seguro
  entry: 8,     // punta del brazo: entrada a la llegada del dueno
  exit: 12,     // salida del dueno del brazo
};

/**
 * Las 17 casillas de recorrido de un brazo, en orden de avance
 * (sentido horario visto desde arriba).
 */
function armTrack(arm) {
  const cells = [];
  const push = (i, j) => cells.push({ i, j });
  switch (arm) {
    case 'N':
      for (let j = 7; j >= 0; j--) push(8, j);   // columna izquierda, hacia afuera
      push(9, 0);                               // punta
      for (let j = 0; j <= 7; j++) push(10, j);  // columna derecha, hacia adentro
      break;
    case 'E':
      for (let i = 11; i <= 18; i++) push(i, 8);
      push(18, 9);
      for (let i = 18; i >= 11; i--) push(i, 10);
      break;
    case 'S':
      for (let j = 11; j <= 18; j++) push(10, j);
      push(9, 18);
      for (let j = 18; j >= 11; j--) push(8, j);
      break;
    case 'W':
      for (let i = 7; i >= 0; i--) push(i, 10);
      push(0, 9);
      for (let i = 0; i <= 7; i++) push(i, 8);
      break;
  }
  return cells;
}

/** Las 7 casillas de llegada de un brazo, de afuera hacia el cielo. */
function armHome(arm) {
  const cells = [];
  for (let k = 1; k <= 7; k++) {
    if (arm === 'N') cells.push({ i: 9, j: k });
    if (arm === 'E') cells.push({ i: 18 - k, j: 9 });
    if (arm === 'S') cells.push({ i: 9, j: 18 - k });
    if (arm === 'W') cells.push({ i: k, j: 9 });
  }
  return cells;
}

/**
 * Recorrido completo: 68 casillas en orden, con su tipo.
 * kind: 'track' | 'safe' | 'exit' | 'entry'; owner: jugador del brazo.
 */
export const TRACK = PLAYERS.flatMap((player) =>
  armTrack(player.arm).map((c, index) => ({
    ...c,
    owner: player.id,
    kind: index === SEGMENT.exit ? 'exit' : index === SEGMENT.safe ? 'safe' : index === SEGMENT.entry ? 'entry' : 'track',
  })),
);

/** Casillas de llegada (7 por jugador). */
export const HOME = PLAYERS.flatMap((player) => armHome(player.arm).map((c) => ({ ...c, owner: player.id })));

/**
 * Los 4 puestos de las fichas en cada carcel (en coordenadas de
 * cuadricula continuas: 0..19).
 */
export const JAIL_SLOTS = PLAYERS.flatMap((player) => {
  const d = 1.4;
  return [[-d, -d], [d, -d], [-d, d], [d, d]].map(([di, dj]) => ({
    u: player.jail.i + di, v: player.jail.j + dj, owner: player.id,
  }));
});

/**
 * Cielo: un triangulo por color en el cuadro central (de 8 a 11), con 4
 * puestos en fila cerca de su base.
 */
export const GOAL_SLOTS = PLAYERS.flatMap((player) => {
  const offsets = [-0.9, -0.3, 0.3, 0.9];
  const near = 8.4, far = 10.6; // fila de puestos dentro del triangulo
  return offsets.map((o) => {
    switch (player.arm) {
      case 'N': return { u: 9.5 + o, v: near, owner: player.id };
      case 'S': return { u: 9.5 + o, v: far, owner: player.id };
      case 'E': return { u: far, v: 9.5 + o, owner: player.id };
      default: return { u: near, v: 9.5 + o, owner: player.id };
    }
  });
});

/** Coordenadas de cuadricula continuas (u, v) -> mundo (x, z). */
export function gridToWorld(u, v) {
  return { x: (u - GRID / 2) * CELL, z: (v - GRID / 2) * CELL };
}

/** Centro de la casilla (i, j) en el mundo. */
export function cellToWorld(i, j) {
  return gridToWorld(i + 0.5, j + 0.5);
}

/** Todos los puntos de anclaje del tablero (para snapping.js). */
export function snapPoints() {
  return [
    ...TRACK.map((c) => cellToWorld(c.i, c.j)),
    ...HOME.map((c) => cellToWorld(c.i, c.j)),
    ...JAIL_SLOTS.map((s) => gridToWorld(s.u, s.v)),
    ...GOAL_SLOTS.map((s) => gridToWorld(s.u, s.v)),
  ];
}
