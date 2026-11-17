// ============================================================
// pieceCatalog.js — Definicion de cada tipo de pieza de madera
// ============================================================
// Cada pieza tiene dos representaciones que deben coincidir:
//   - geometry: la forma visual (Three.js)
//   - shapes:   la forma fisica para colisiones (cannon-es)
//
// Para que coincidan, las piezas "prisma" (tejado, medio cilindro,
// cilindro) se construyen desde la MISMA lista de puntos 2D tanto para
// la geometria como para el poliedro convexo de la fisica.
//
// Convencion: el origen local de cada pieza es su centro de masa
// (cannon-es asume eso), por eso algunas formas se desplazan.
//
// Para agregar una pieza nueva: anadir una entrada a PIECES con
// id, name, icon (SVG) y build().
//
// Opciones de cada entrada:
//   palette: false     no aparece en la caja de bloques (fichas, dados, ajedrez...)
//   material           'wood' (por defecto) | 'plastic' | 'die'
//   snappable: true    se acomoda en las casillas imantadas (sim/snapping.js)
//   restHeight         altura del centro de masa en reposo (para acomodarla)
//   stackHeight        alto de la pieza al apilarla (damas coronadas)
//   keepUV: true       conserva los UV originales (el dado usa una textura por cara)
//
// Este archivo lo usan el navegador (geometria + fisica) y el servidor
// (solo la fisica, con buildBody). No toca el DOM.
// ============================================================

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { applyBoxUV } from './woodTexture.js';

// ------------------------------------------------------------
// Utilidades de geometria
// ------------------------------------------------------------

/**
 * Corrige el orden de los vertices de cada cara para que la normal apunte
 * hacia afuera (cannon-es lo exige). Funciona para cualquier poliedro
 * convexo: compara la normal de la cara con la direccion desde el centro.
 */
function orientFaces(vertices, faces) {
  const c = vertices.reduce((acc, v) => acc.add(v), new THREE.Vector3()).divideScalar(vertices.length);
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3(), fc = new THREE.Vector3();
  return faces.map((face) => {
    const [a, b, d] = face.map((i) => vertices[i]);
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(d, a));
    fc.set(0, 0, 0);
    face.forEach((i) => fc.add(vertices[i]));
    fc.divideScalar(face.length).sub(c);
    return n.dot(fc) < 0 ? [...face].reverse() : face;
  });
}

/** Crea un ConvexPolyhedron de cannon-es desde vertices THREE.Vector3 + caras. */
function makeConvex(vertices, faces) {
  return new CANNON.ConvexPolyhedron({
    vertices: vertices.map((v) => new CANNON.Vec3(v.x, v.y, v.z)),
    faces: orientFaces(vertices, faces),
  });
}

/**
 * Prisma recto a partir de un poligono convexo 2D (en el plano XY),
 * extruido a lo largo de Z entre -depth/2 y +depth/2.
 * @param {Array<[number, number]>} points — poligono en sentido antihorario
 * @returns {{vertices: THREE.Vector3[], faces: number[][]}}
 */
function prismPolyhedron(points, depth) {
  const n = points.length;
  const h = depth / 2;
  const vertices = [
    ...points.map(([x, y]) => new THREE.Vector3(x, y, -h)), // 0..n-1  cara trasera
    ...points.map(([x, y]) => new THREE.Vector3(x, y, h)),  // n..2n-1 cara delantera
  ];
  const faces = [
    points.map((_, i) => n + i),            // tapa delantera
    points.map((_, i) => n - 1 - i),        // tapa trasera
    ...points.map((_, i) => {               // caras laterales
      const j = (i + 1) % n;
      return [i, j, n + j, n + i];
    }),
  ];
  return { vertices, faces };
}

/** Geometria visual de un prisma 2D extruido en Z (centrado en Z). */
function prismGeometry(points, depth) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

/** Geometria visual (caras planas) a partir de un poliedro. */
function polyhedronGeometry(vertices, faces) {
  const pos = [];
  orientFaces(vertices, faces).forEach((face) => {
    // Triangulacion en abanico (valida para caras convexas)
    for (let i = 1; i < face.length - 1; i++) {
      [face[0], face[i], face[i + 1]].forEach((k) => pos.push(vertices[k].x, vertices[k].y, vertices[k].z));
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Puntos de un poligono regular de `segments` lados y radio r (antihorario). */
function circlePoints(r, segments, from = 0, to = Math.PI * 2, closed = true) {
  const pts = [];
  const count = closed ? segments : segments + 1;
  for (let i = 0; i < count; i++) {
    const a = from + ((to - from) * i) / segments;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/** Rota vertices de "eje Z" a "eje Y" (para cilindros de pie). */
function zToY(vertices) {
  return vertices.map((v) => new THREE.Vector3(v.x, v.z, -v.y));
}

/** Forma fisica de cilindro de pie (16 lados) entre y0 e y1. */
function uprightCylinderShape(radius, y0, y1) {
  const poly = prismPolyhedron(circlePoints(radius, 16), y1 - y0);
  return {
    shape: makeConvex(zToY(poly.vertices), poly.faces),
    offset: new CANNON.Vec3(0, (y0 + y1) / 2, 0),
  };
}

/** Une varias geometrias en una (todas no indexadas, con normal y uv). */
function merge(geos) {
  return mergeGeometries(geos.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.clearGroups();
    return ng;
  }));
}

/**
 * Pieza "torneada" (como las de ajedrez): una silueta que se gira
 * alrededor del eje Y. La fisica es un cilindro del mismo alto.
 * @param {Array<[number, number]>} profile — puntos (radio, altura) desde la base
 * @param {object} o
 * @param {number} o.radius — radio del cilindro de colision
 * @param {number} [o.height] — alto total si las geometrias extra sobresalen de la silueta
 * @param {number} [o.base] — altura del centro de masa sobre la base (por defecto 35% del alto)
 * @param {THREE.BufferGeometry[]} [o.extra] — geometrias extra (en coordenadas desde la base)
 */
function turned(profile, { radius, height: totalHeight, base, extra = [] }) {
  const height = totalHeight ?? Math.max(...profile.map(([, y]) => y));
  const b = base ?? height * 0.35;
  return () => {
    const lathe = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 28);
    const geometry = extra.length ? merge([lathe, ...extra.map((g) => g.clone())]) : lathe;
    geometry.translate(0, -b, 0);
    return {
      geometry,
      shapes: [uprightCylinderShape(radius, -b, height - b)],
      volume: Math.PI * radius * radius * height * 0.5,
      size: height / 2,
    };
  };
}

/** Cabeza del caballo: silueta extruida (mirando hacia -Z, hacia el rival). */
function knightHead() {
  const pts = [
    [-0.36, 0.35], [0.36, 0.35], [0.3, 0.6], [0.22, 0.82], [0.28, 1.0], [0.58, 1.14],
    [0.64, 1.3], [0.52, 1.42], [0.22, 1.46], [0.12, 1.72], [0.0, 1.56], [-0.16, 1.76],
    [-0.27, 1.5], [-0.42, 1.2], [-0.44, 0.8], [-0.4, 0.5],
  ];
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  geo.translate(0, 0, -0.21);
  geo.rotateY(Math.PI / 2); // la nariz (+X) pasa a mirar hacia -Z
  return geo;
}

/** Cruz de la corona del rey. */
function kingCross() {
  const v = new THREE.BoxGeometry(0.16, 0.52, 0.16);
  v.translate(0, 2.24, 0);
  const h = new THREE.BoxGeometry(0.44, 0.14, 0.16);
  h.translate(0, 2.3, 0);
  return merge([v, h]);
}

/** Almenas de la torre: 4 bloques sobre el borde superior. */
function rookBattlements() {
  const geos = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.BoxGeometry(0.2, 0.18, 0.2);
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    g.translate(Math.cos(a) * 0.38, 1.69, Math.sin(a) * 0.38);
    geos.push(g);
  }
  return merge(geos);
}

// ------------------------------------------------------------
// Catalogo
// ------------------------------------------------------------
// build() devuelve:
//   geometry: THREE.BufferGeometry
//   shapes:   [{ shape: CANNON.Shape, offset?: CANNON.Vec3 }]
//   volume:   volumen aproximado (para calcular la masa)
//   size:     radio aproximado (para elegir donde aparece la pieza)

const box = (w, h, d) => () => ({
  geometry: new THREE.BoxGeometry(w, h, d),
  shapes: [{ shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)) }],
  volume: w * h * d,
  size: Math.max(w, h, d) / 2,
});

const cylinder = (r, h) => () => {
  const poly = prismPolyhedron(circlePoints(r, 16), h);
  return {
    geometry: new THREE.CylinderGeometry(r, r, h, 24),
    shapes: [{ shape: makeConvex(zToY(poly.vertices), poly.faces) }],
    volume: Math.PI * r * r * h,
    size: Math.max(r, h / 2),
  };
};

export const PIECES = [
  {
    id: 'cube',
    name: 'Cubo',
    icon: '<path d="M20 5 L33 12 V28 L20 35 L7 28 V12 Z M7 12 L20 19 L33 12 M20 19 V35"/>',
    build: box(2, 2, 2),
  },
  {
    id: 'brick',
    name: 'Ladrillo',
    icon: '<path d="M4 16 L22 10 L36 14 V23 L18 30 L4 25 Z M4 16 L18 21 L36 14 M18 21 V30"/>',
    build: box(4, 1, 2),
  },
  {
    id: 'plank',
    name: 'Tabla',
    icon: '<path d="M3 21 L27 13 L37 16 L13 24 Z M3 21 V24 L13 27 L37 19 V16 M13 24 V27"/>',
    build: box(6, 0.5, 1.5),
  },
  {
    id: 'cylinder',
    name: 'Cilindro',
    icon: '<ellipse cx="20" cy="11" rx="10" ry="4"/><path d="M10 11 V29 A10 4 0 0 0 30 29 V11"/>',
    build: cylinder(1, 2),
  },
  {
    id: 'column',
    name: 'Columna',
    icon: '<ellipse cx="20" cy="6" rx="6" ry="2.5"/><path d="M14 6 V34 A6 2.5 0 0 0 26 34 V6"/>',
    build: cylinder(0.6, 4),
  },
  {
    id: 'pyramid',
    name: 'Piramide',
    icon: '<path d="M20 4 L34 29 L20 35 L6 29 Z M20 4 V35"/>',
    build: () => {
      // Base cuadrada 2x2, altura 2. El centro de masa de una piramide esta a
      // 1/4 de la altura desde la base, por eso la base queda en y = -0.5.
      const h = 2, base = -h / 4;
      const v = [
        new THREE.Vector3(-1, base, -1), new THREE.Vector3(1, base, -1),
        new THREE.Vector3(1, base, 1), new THREE.Vector3(-1, base, 1),
        new THREE.Vector3(0, base + h, 0),
      ];
      const faces = [[0, 1, 2, 3], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]];
      return {
        geometry: polyhedronGeometry(v, faces),
        shapes: [{ shape: makeConvex(v, faces) }],
        volume: (4 * h) / 3,
        size: 1.2,
      };
    },
  },
  {
    id: 'roof',
    name: 'Tejado',
    icon: '<path d="M6 30 L16 10 L26 30 Z M16 10 L24 6 L34 26 L26 30"/>',
    build: () => {
      // Triangulo de base 2 y altura 1.5; su centroide queda en el origen.
      const pts = [[-1, -0.5], [1, -0.5], [0, 1]];
      const depth = 2;
      const poly = prismPolyhedron(pts, depth);
      return {
        geometry: prismGeometry(pts, depth),
        shapes: [{ shape: makeConvex(poly.vertices, poly.faces) }],
        volume: 1.5 * depth,
        size: 1.2,
      };
    },
  },
  {
    id: 'halfCylinder',
    name: 'Medio cilindro',
    icon: '<path d="M5 30 A11 11 0 0 1 27 30 Z M16 19 L24 15 M27 30 L35 26 A11 11 0 0 0 24 15"/>',
    build: () => {
      // Semicirculo de radio 1 (cara plana abajo). Su centro de masa esta a
      // 4r/(3*PI) sobre la cara plana, asi que se baja esa cantidad.
      const r = 1, depth = 2;
      const cy = (4 * r) / (3 * Math.PI);
      const pts = circlePoints(r, 12, 0, Math.PI, false).map(([x, y]) => [x, y - cy]);
      const poly = prismPolyhedron(pts, depth);
      return {
        geometry: prismGeometry(pts, depth),
        shapes: [{ shape: makeConvex(poly.vertices, poly.faces) }],
        volume: (Math.PI * r * r * depth) / 2,
        size: 1.2,
      };
    },
  },
  {
    id: 'arch',
    name: 'Arco',
    icon: '<path d="M4 32 V14 H36 V32 H28 V30 A8 8 0 0 0 12 30 V32 Z"/>',
    build: () => {
      // Bloque de 4 x 2 con un hueco semicircular de radio 1 abajo.
      // El arco no es convexo, asi que la fisica usa 3 cajas: dos patas y
      // un dintel (el hueco del arco se aproxima como rectangular).
      const w = 4, h = 2, depth = 1.5, r = 1;
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, 0);
      shape.lineTo(-r, 0);
      shape.absarc(0, 0, r, Math.PI, 0, true);
      shape.lineTo(w / 2, 0);
      shape.lineTo(w / 2, h);
      shape.lineTo(-w / 2, h);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 });
      geometry.translate(0, -h / 2, -depth / 2);

      const legHalf = new CANNON.Vec3((w / 2 - r) / 2, h / 2, depth / 2);
      const legX = r + (w / 2 - r) / 2;
      return {
        geometry,
        shapes: [
          { shape: new CANNON.Box(legHalf), offset: new CANNON.Vec3(-legX, 0, 0) },
          { shape: new CANNON.Box(legHalf), offset: new CANNON.Vec3(legX, 0, 0) },
          { shape: new CANNON.Box(new CANNON.Vec3(r, (h - r) / 2, depth / 2)), offset: new CANNON.Vec3(0, h / 2 - (h - r) / 2, 0) },
        ],
        volume: (w * h - (Math.PI * r * r) / 2) * depth,
        size: 2,
      };
    },
  },
  {
    id: 'sphere',
    name: 'Esfera',
    icon: '<circle cx="20" cy="20" r="13"/><ellipse cx="20" cy="20" rx="13" ry="4.5"/>',
    build: () => ({
      geometry: new THREE.SphereGeometry(1, 24, 16),
      shapes: [{ shape: new CANNON.Sphere(1) }],
      volume: (4 / 3) * Math.PI,
      size: 1,
    }),
  },

  // --- Piezas de juegos de mesa (no salen en la caja de bloques) ---
  {
    id: 'pawn',
    name: 'Ficha',
    palette: false,
    material: 'plastic',
    snappable: true,      // se acomoda en las casillas del tablero
    restHeight: 0.3,      // altura del centro de masa cuando esta de pie
    build: () => {
      // Silueta de peon (radio, altura) que se gira alrededor del eje Y.
      // La base queda en y = -0.3, asi el origen esta cerca del centro de masa
      // (la base es la parte mas pesada) y la ficha se para con estabilidad.
      const profile = [
        [0, 0], [0.24, 0], [0.24, 0.06], [0.2, 0.11], [0.13, 0.28], [0.1, 0.48],
        [0.15, 0.53], [0.17, 0.62], [0.15, 0.71], [0.09, 0.77], [0, 0.8],
      ].map(([r, y]) => new THREE.Vector2(r, y - 0.3));
      const geometry = new THREE.LatheGeometry(profile, 24);
      // Fisica: cilindro de 16 lados del mismo alto (-0.3 .. 0.5)
      const poly = prismPolyhedron(circlePoints(0.22, 16), 0.8);
      return {
        geometry,
        shapes: [{ shape: makeConvex(zToY(poly.vertices), poly.faces), offset: new CANNON.Vec3(0, 0.1, 0) }],
        volume: 0.35,
        size: 0.4,
      };
    },
  },
  {
    id: 'die',
    name: 'Dado',
    palette: false,
    material: 'die',      // 6 materiales, uno por cara (ver diceTextures.js)
    keepUV: true,         // cada cara usa la textura completa
    build: box(1.4, 1.4, 1.4),
  },

  // --- Ajedrez (casillas de 2 unidades) ---
  chessPiece('chessPawn', 'Peón', [
    [0, 0], [0.55, 0], [0.55, 0.1], [0.45, 0.18], [0.42, 0.24], [0.28, 0.32], [0.2, 0.62],
    [0.3, 0.68], [0.3, 0.74], [0.18, 0.78], [0.27, 0.88], [0.3, 1.0], [0.27, 1.12], [0.18, 1.22], [0, 1.3],
  ], { radius: 0.48 }),
  chessPiece('rook', 'Torre', [
    [0, 0], [0.6, 0], [0.6, 0.12], [0.5, 0.2], [0.47, 0.28], [0.36, 0.36], [0.34, 1.1],
    [0.45, 1.2], [0.47, 1.28], [0.47, 1.6], [0.3, 1.6], [0.3, 1.48], [0, 1.48],
  ], { radius: 0.52, height: 1.78, extra: [rookBattlements()] }),
  chessPiece('knight', 'Caballo', [
    [0, 0], [0.6, 0], [0.6, 0.12], [0.5, 0.2], [0.46, 0.3], [0.4, 0.4], [0, 0.4],
  ], { radius: 0.52, height: 1.76, base: 0.6, extra: [knightHead()] }),
  chessPiece('bishop', 'Alfil', [
    [0, 0], [0.6, 0], [0.6, 0.12], [0.5, 0.2], [0.47, 0.28], [0.3, 0.38], [0.22, 1.0],
    [0.36, 1.06], [0.36, 1.12], [0.24, 1.16], [0.32, 1.32], [0.34, 1.46], [0.26, 1.64],
    [0.12, 1.76], [0.1, 1.8], [0.13, 1.84], [0.09, 1.9], [0, 1.92],
  ], { radius: 0.52 }),
  chessPiece('queen', 'Reina', [
    [0, 0], [0.65, 0], [0.65, 0.12], [0.55, 0.2], [0.5, 0.3], [0.32, 0.42], [0.24, 1.3],
    [0.38, 1.38], [0.38, 1.44], [0.26, 1.5], [0.3, 1.62], [0.44, 1.9], [0.36, 1.95],
    [0.2, 1.98], [0.14, 2.04], [0.15, 2.12], [0.08, 2.18], [0, 2.2],
  ], { radius: 0.56 }),
  chessPiece('king', 'Rey', [
    [0, 0], [0.65, 0], [0.65, 0.12], [0.55, 0.2], [0.5, 0.3], [0.32, 0.42], [0.25, 1.35],
    [0.4, 1.42], [0.4, 1.48], [0.27, 1.54], [0.34, 1.7], [0.42, 1.95], [0.3, 2.0], [0, 2.0],
  ], { radius: 0.56, height: 2.5, extra: [kingCross()] }),

  // --- Damas ---
  {
    id: 'checker',
    name: 'Ficha de damas',
    palette: false,
    snappable: true,
    restHeight: 0.15,
    stackHeight: 0.3,     // dos fichas apiladas = dama coronada
    build: () => {
      // Disco con el centro un poco hundido, como las fichas de madera
      const profile = [[0, 0], [0.72, 0], [0.75, 0.03], [0.75, 0.27], [0.72, 0.3], [0.52, 0.3], [0.46, 0.25], [0, 0.25]];
      const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 36);
      geometry.translate(0, -0.15, 0);
      return {
        geometry,
        shapes: [uprightCylinderShape(0.75, -0.15, 0.15)],
        volume: Math.PI * 0.75 * 0.75 * 0.3,
        size: 0.75,
      };
    },
  },

  // --- Triki (tres en linea) ---
  {
    id: 'ticX',
    name: 'X',
    palette: false,
    material: 'plastic',
    snappable: true,
    restHeight: 0.25,
    build: () => {
      // Dos barras cruzadas a +-45 grados
      const bar = (angle) => {
        const g = new THREE.BoxGeometry(3, 0.5, 0.6);
        g.rotateY(angle);
        return g;
      };
      const half = new CANNON.Vec3(1.5, 0.25, 0.3);
      const orient = (angle) => new CANNON.Quaternion().setFromEuler(0, angle, 0);
      return {
        geometry: merge([bar(Math.PI / 4), bar(-Math.PI / 4)]),
        shapes: [
          { shape: new CANNON.Box(half), orientation: orient(Math.PI / 4) },
          { shape: new CANNON.Box(half), orientation: orient(-Math.PI / 4) },
        ],
        volume: 1.6,
        size: 1.5,
      };
    },
  },
  {
    id: 'ticO',
    name: 'O',
    palette: false,
    material: 'plastic',
    snappable: true,
    restHeight: 0.3,
    build: () => {
      const geometry = new THREE.TorusGeometry(1.05, 0.3, 16, 40);
      geometry.rotateX(Math.PI / 2);
      return {
        geometry,
        // Un aro no es convexo; para apoyarlo sobre el tablero basta un disco
        shapes: [uprightCylinderShape(1.35, -0.3, 0.3)],
        volume: 1.6,
        size: 1.35,
      };
    },
  },
];

/**
 * Definicion de una pieza de ajedrez (madera, se acomoda en las casillas
 * y su centro de masa queda bajo, como en las piezas reales con plomo).
 */
function chessPiece(id, name, profile, opts) {
  const height = opts.height ?? Math.max(...profile.map(([, y]) => y));
  const base = opts.base ?? height * 0.35;
  return {
    id,
    name,
    palette: false,
    snappable: true,
    restHeight: base,
    build: turned(profile, { ...opts, height, base }),
  };
}

/** Piezas que salen en la caja de bloques de construccion. */
export const BUILD_PIECES = PIECES.filter((p) => p.palette !== false);

/** Definicion de una pieza por su id. */
export function pieceById(id) {
  return PIECES.find((p) => p.id === id);
}

/** Colores de juguete. 'mix' elige uno al azar para cada pieza nueva. */
export const COLORS = [
  { id: 'mix', name: 'Mezcla', hex: null },
  { id: 'wood', name: 'Madera', hex: '#e2b47c' },
  { id: 'red', name: 'Rojo', hex: '#d9473b' },
  { id: 'orange', name: 'Naranja', hex: '#ee8a2e' },
  { id: 'yellow', name: 'Amarillo', hex: '#f2c230' },
  { id: 'green', name: 'Verde', hex: '#4fa35a' },
  { id: 'blue', name: 'Azul', hex: '#3a78c9' },
  { id: 'purple', name: 'Morado', hex: '#8c5bb5' },
];

/**
 * Devuelve el hex de un color: acepta un id del catalogo ('mix' = uno al
 * azar) o directamente un hex ('#d9473b', lo usan los tableros).
 */
export function resolveColor(colorId) {
  if (colorId?.startsWith?.('#')) return colorId;
  const solid = COLORS.filter((c) => c.hex);
  const found = COLORS.find((c) => c.id === colorId);
  if (found?.hex) return found.hex;
  return solid[Math.floor(Math.random() * solid.length)].hex;
}

// Las geometrias se construyen una sola vez por tipo y se reutilizan.
const built = new Map();

/**
 * Solo la parte fisica de una pieza (la usa la simulacion, tambien en el
 * servidor, donde no se dibuja nada). Las formas se crean nuevas cada vez
 * porque cannon-es no permite compartir una forma entre cuerpos.
 * @returns {{def, shapes, volume, size}}
 */
export function buildBody(id) {
  const def = pieceById(id);
  if (!def) throw new Error(`Pieza desconocida: ${id}`);
  const { geometry, ...rest } = def.build();
  geometry.dispose();
  return { def, ...rest };
}

/**
 * Geometria visual de una pieza (la usa el navegador). Se construye una
 * sola vez por tipo y se comparte entre todas las piezas de ese tipo.
 */
export function pieceGeometry(id) {
  if (!built.has(id)) {
    const def = pieceById(id);
    if (!def) throw new Error(`Pieza desconocida: ${id}`);
    const { geometry } = def.build();
    built.set(id, def.keepUV ? geometry : applyBoxUV(geometry));
  }
  return built.get(id);
}
