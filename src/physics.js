// ============================================================
// physics.js — Mundo fisico (cannon-es)
// ============================================================
// Gravedad, colisiones y apilado de las piezas. Three.js solo dibuja;
// la posicion "real" de cada pieza la decide este mundo fisico y
// pieces.js la copia a la malla visual cada frame.
// ============================================================

import * as CANNON from 'cannon-es';
import { PHYSICS } from './config.js';

export const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, PHYSICS.gravity, 0),
});

// SAP es mas eficiente que el broadphase por defecto con muchas piezas.
world.broadphase = new CANNON.SAPBroadphase(world);
// Las piezas quietas "se duermen" y dejan de calcularse hasta que algo las toque.
world.allowSleep = true;
world.solver.iterations = 12;

/** Material de madera: friccion y rebote de todos los contactos. */
export const woodMaterial = new CANNON.Material('wood');
world.addContactMaterial(new CANNON.ContactMaterial(woodMaterial, woodMaterial, {
  friction: PHYSICS.friction,
  restitution: PHYSICS.restitution,
}));
world.defaultContactMaterial.friction = PHYSICS.friction;
world.defaultContactMaterial.restitution = PHYSICS.restitution;

/**
 * Crea un cuerpo estatico con forma de caja (mesa, bordes).
 * @param {{x,y,z}} half — mitad de las medidas
 * @param {{x,y,z}} position — centro
 */
export function addStaticBox(half, position) {
  const body = new CANNON.Body({
    mass: 0,
    material: woodMaterial,
    shape: new CANNON.Box(new CANNON.Vec3(half.x, half.y, half.z)),
    position: new CANNON.Vec3(position.x, position.y, position.z),
  });
  world.addBody(body);
  return body;
}

/**
 * Funciones que se ejecutan antes de cada sub-paso de la simulacion.
 * interaction.js registra aqui el control de la pieza agarrada, para que
 * se aplique en cada sub-paso y no solo una vez por frame.
 */
const preStepHandlers = new Set();
export function onPreStep(fn) {
  preStepHandlers.add(fn);
}
world.addEventListener('preStep', () => {
  preStepHandlers.forEach((fn) => fn(PHYSICS.timeStep));
});

/**
 * Avanza la simulacion con paso fijo: cannon-es mide el tiempo real
 * transcurrido y hace los sub-pasos necesarios (independiente de los FPS).
 */
export function stepPhysics() {
  world.fixedStep(PHYSICS.timeStep, PHYSICS.maxSubSteps);
}
