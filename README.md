# Taller 1 — Computacion Visual

App web de dibujo/arte 3D controlada por gestos de mano usando la camara.

## Integrantes

- Andres Felipe Alarcon Pulido — Captura y deteccion de manos (`src/handTracker.js`)
- Juan Sebastian Gamez Ariza — Interpretacion de gestos y mapeo 3D (`src/gestureInterpreter.js`)
- Emiliano Guerra Gallego — Interfaz, controles y visualizacion (`src/ui.js`)

## Estructura

```
src/
  handTracker.js          <- Andres Felipe: webcam + MediaPipe Hands
  gestureInterpreter.js   <- Juan Sebastian: landmarks -> pose 3D + gestos
  ui.js                   <- Emiliano: layout, controles, estilos
  app.js                  <- Punto de entrada, conecta los 3 modulos
index.html
package.json
base.jsx                  <- Codigo base del profesor (referencia)
```

## Instalacion

```bash
npm install
npm run dev
```

## Interfaces entre modulos

Cada modulo exporta funciones con un contrato claro.
Mientras un companero no termina su parte, los demas trabajan con los datos simulados que ya vienen en cada archivo.

### handTracker.js -> gestureInterpreter.js

```js
// handTracker exporta:
{
  landmarks: [],   // array de 21 puntos {x, y, z} normalizados 0-1
  handedness: '',  // 'Left' | 'Right'
  detected: false  // hay mano visible o no
}
```

### gestureInterpreter.js -> app.js

```js
// gestureInterpreter exporta:
{
  position: { x, y, z },  // coordenadas 3D mapeadas al volumen de dibujo
  direction: { x, y, z }, // vector de direccion
  gesture: '',             // 'paint' | 'idle' | 'clear' | 'colorChange'
  color: [r, g, b]        // color activo
}
```
