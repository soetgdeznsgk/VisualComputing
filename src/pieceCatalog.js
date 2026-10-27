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
// ============================================================

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
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
];

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

/** Devuelve el hex de un color del catalogo ('mix' = uno al azar). */
export function resolveColor(colorId) {
  const solid = COLORS.filter((c) => c.hex);
  const found = COLORS.find((c) => c.id === colorId);
  if (found?.hex) return found.hex;
  return solid[Math.floor(Math.random() * solid.length)].hex;
}

// Las geometrias se construyen una sola vez por tipo y se reutilizan.
const built = new Map();

/**
 * Devuelve la definicion construida de una pieza (con cache).
 * Las formas fisicas se crean nuevas cada vez porque cannon-es
 * no permite compartir una forma entre cuerpos de forma segura.
 */
export function buildPiece(id) {
  const def = PIECES.find((p) => p.id === id);
  if (!def) throw new Error(`Pieza desconocida: ${id}`);
  const fresh = def.build();
  if (!built.has(id)) built.set(id, applyBoxUV(fresh.geometry));
  else fresh.geometry.dispose();
  return { def, ...fresh, geometry: built.get(id) };
}
