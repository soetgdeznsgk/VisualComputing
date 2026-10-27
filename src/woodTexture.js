// ============================================================
// woodTexture.js — Textura de vetas de madera generada por codigo
// ============================================================
// Se dibuja en un <canvas> (sin imagenes externas) en tonos casi blancos,
// para que el color del material la "tina": la misma textura sirve para
// la pieza roja, la azul o la de madera natural.
// ============================================================

import * as THREE from 'three';

let cached = null;

/** Numero pseudoaleatorio reproducible (la textura sale igual siempre). */
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Devuelve la textura de madera (se crea una sola vez y se comparte).
 * @returns {THREE.CanvasTexture}
 */
export function getWoodTexture() {
  if (cached) return cached;

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rand = seededRandom(7);

  // Fondo claro
  ctx.fillStyle = '#f4ece0';
  ctx.fillRect(0, 0, size, size);

  // Vetas: lineas horizontales onduladas de distinto grosor y opacidad.
  for (let i = 0; i < 70; i++) {
    const y0 = rand() * size;
    const amp = 2 + rand() * 6;
    const freq = 1 + rand() * 2;
    const phase = rand() * Math.PI * 2;
    ctx.strokeStyle = `rgba(120, 80, 40, ${0.04 + rand() * 0.12})`;
    ctx.lineWidth = 0.5 + rand() * 2.5;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 8) {
      // Repetir el seno exacto en x=0 y x=size para que la textura no tenga costuras
      const y = y0 + amp * Math.sin((x / size) * Math.PI * 2 * Math.round(freq) + phase);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Algunos nudos pequenos
  for (let i = 0; i < 3; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    for (let r = 10; r > 1; r -= 2.5) {
      ctx.strokeStyle = `rgba(110, 70, 35, ${0.08 + (10 - r) * 0.015})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 2.2, r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  cached = new THREE.CanvasTexture(canvas);
  cached.wrapS = cached.wrapT = THREE.RepeatWrapping;
  cached.colorSpace = THREE.SRGBColorSpace;
  cached.anisotropy = 4;
  return cached;
}

/**
 * Asigna coordenadas UV por "proyeccion de caja": cada triangulo usa las dos
 * coordenadas del plano al que mas se parece. Asi la veta tiene el mismo
 * tamano en todas las piezas, sin importar como se creo la geometria.
 * @param {THREE.BufferGeometry} geometry
 * @param {number} scale — repeticiones de textura por unidad
 * @returns {THREE.BufferGeometry} geometria no indexada con UVs nuevos
 */
export function applyBoxUV(geometry, scale = 0.18) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();

  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);

    [a, b, c].forEach((p, j) => {
      let u, v;
      if (ax >= ay && ax >= az) { u = p.z; v = p.y; }      // cara mirando a X
      else if (ay >= az) { u = p.x; v = p.z; }             // cara mirando a Y
      else { u = p.x; v = p.y; }                           // cara mirando a Z
      uv[(i + j) * 2] = u * scale;
      uv[(i + j) * 2 + 1] = v * scale;
    });
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  // Se conservan las normales originales (esfera y cilindro se ven suaves).
  if (!geo.attributes.normal) geo.computeVertexNormals();
  return geo;
}
