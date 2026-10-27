# Taller 1 — Computación Visual: Bloques 3D con gestos

Juego de construcción con **bloques de madera 3D** (como los juguetes de cubos, cilindros y pirámides) que se manipulan con las manos frente a la cámara. Las piezas tienen física real: caen, chocan, se apilan y se pueden lanzar.

- **Mano derecha:** agarra, mueve y rota las piezas.
- **Mano izquierda:** gira la cámara y hace zoom.
- **Ratón y teclado:** alternativa completa si no hay cámara.

## Integrantes

- Andrés Felipe Alarcón Pulido
- Juan Sebastián Gámez Ariza
- Emiliano Guerra Gallego

## Cómo ejecutarlo

Requiere [Node.js](https://nodejs.org) (versión LTS).

```bash
npm install
npm run dev
```

Abre la dirección que imprime Vite (normalmente `http://localhost:5173`) en **Chrome** y acepta el permiso de cámara. La cámara solo funciona en `localhost` o con HTTPS.

> En Windows, si PowerShell muestra *"running scripts is disabled"*, usa `npm.cmd run dev` o ejecuta una vez `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.

## Cómo jugar

### ✋ Mano derecha — piezas

| Gesto | Acción |
|---|---|
| Mover la mano | Mueve el cursor (anillo naranja) |
| **Pellizco** (pulgar + índice) sobre una pieza | Agarrarla |
| Acercar / alejar la mano de la cámara | Empujar la pieza al fondo / traerla |
| Girar la muñeca | Rotar la pieza |
| Abrir los dedos | Soltar (si la mano se mueve rápido, la lanza) |
| Mantener el cursor ~1 s sobre un botón | Presionarlo (elegir pieza, color, etc.) |
| Soltar una pieza sobre la **papelera** | Eliminarla |

### 🤚 Mano izquierda — cámara

| Gesto | Acción |
|---|---|
| **Puño** + mover la mano | Girar la vista ("agarrar el mundo") |
| **Pellizco** + subir / bajar | Zoom |
| **V** sostenida 1 s | Restablecer la vista |
| Mano abierta | Descansar (no hace nada) |

### 🖱️ Ratón y teclado

| Control | Acción |
|---|---|
| Clic izquierdo sostenido | Agarrar y mover |
| Rueda (con pieza agarrada) | Profundidad |
| Rueda (sin pieza) | Zoom |
| Q / E | Rotar la pieza agarrada |
| Clic derecho + arrastrar | Girar la vista |
| R | Restablecer la vista |
| Supr | Borrar la pieza bajo el cursor |

## Piezas

Cubo, ladrillo, tabla, cilindro, columna, pirámide, tejado (prisma triangular), medio cilindro, arco y esfera, en 7 colores o en "mezcla" (color al azar).

## Arquitectura

```
src/
  app.js                 Punto de entrada: conecta los modulos y corre el loop
  config.js              Todos los parametros ajustables (sensibilidad, fisica, camara...)

  handTracker.js         Webcam + MediaPipe Hands -> landmarks de cada mano
  gestureInterpreter.js  Landmarks -> pose (pellizco, puno, V...), cursor, profundidad, giro
  mouseInput.js          Raton/teclado con el mismo formato que la mano derecha

  scene.js               Renderer, luces y mesa de madera (Three.js)
  cameraRig.js           Camara orbital; la controla la mano izquierda
  physics.js             Mundo fisico (cannon-es): gravedad y colisiones
  pieceCatalog.js        Definicion de cada pieza: geometria visual + forma fisica
  pieces.js              Crear / eliminar / sincronizar piezas en la mesa
  woodTexture.js         Textura de vetas de madera generada por codigo
  interaction.js         Agarrar, mover, rotar, soltar y tirar a la papelera

  ui.js                  Paneles, botones, cursor de la mano, papelera, estado
  styles.css             Estilos de la interfaz
index.html
base.jsx                 Codigo base del profesor (referencia)
```

### Flujo de cada frame

```
camara -> handTracker -> gestureInterpreter -+-> cameraRig    (mano izquierda)
                                             +-> interaction  (mano derecha)
raton/teclado (mouseInput) ------------------+   (si no hay mano derecha)

interaction -> physics (cannon-es) -> pieces (copia a Three.js) -> render
```

### Ideas clave

- **Dos mundos sincronizados:** cannon-es calcula dónde está cada pieza y Three.js solo la dibuja. Cada frame se copia la posición y rotación del cuerpo físico a la malla.
- **Agarrar sin atravesar:** la pieza agarrada no se teletransporta al cursor. En cada paso de la física se le da la velocidad necesaria para llegar al objetivo, así sigue chocando y empujando a las demás. Al soltarla conserva esa velocidad (por eso se puede lanzar).
- **Profundidad con una sola cámara:** se usa el tamaño aparente de la palma. Si la mano se ve más grande, está más cerca de la cámara y la pieza se empuja al fondo.
- **Gestos estables:** cada pose debe repetirse varios frames seguidos para aceptarse, y el pellizco usa dos umbrales (histéresis) para no parpadear.
- **Formas que coinciden:** las piezas tipo prisma se construyen desde la misma lista de puntos para la geometría visual y para el poliedro de colisión.
- **Sin cámara no se rompe:** si se niega el permiso, la app sigue funcionando con el ratón.

### Ajustar la sensibilidad

Casi todo se calibra en `src/config.js`: umbrales del pellizco (`GESTURE.pinchIn` / `pinchOut`), zona útil de la cámara (`GESTURE.activeArea`), sensibilidad de profundidad y giro (`GRAB.depthGain`, `GRAB.rollGain`), velocidad de la cámara (`LEFT_HAND`), gravedad, etc.

## Tecnologías

- [Three.js](https://threejs.org) — render 3D
- [cannon-es](https://github.com/pmndrs/cannon-es) — física
- [MediaPipe Hands](https://github.com/google/mediapipe) — detección de manos (cargado desde jsDelivr)
- [Vite](https://vitejs.dev) — servidor de desarrollo y build
