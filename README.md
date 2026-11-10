# Computación Visual: Mesa de juegos 3D con gestos

Mesa virtual con **juegos de mesa 3D** que se manipulan con las manos frente a la cámara. Las piezas tienen física real: caen, chocan, se apilan y se pueden lanzar.

Juegos disponibles:

- **Bloques:** construcción libre con bloques de madera (cubos, cilindros, pirámides, arcos...).
- **Parqués:** tablero colombiano de 4 colores con 16 fichas y 2 dados. Las casillas son **imantadas**: una ficha soltada cerca de una casilla se acomoda sola. Las reglas no están programadas; las ponen los jugadores, como en la mesa real.

Controles:

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

### 🎲 Parqués

| Acción | Cómo |
|---|---|
| Mover una ficha | Agarrarla y soltarla cerca de una casilla: se centra y se endereza sola. Un anillo blanco muestra dónde va a caer. |
| Varias fichas en una casilla | Se reparten en las esquinas de la casilla (hasta 4) |
| Lanzar los dados | Agarrarlos y lanzarlos con la mano, o el botón **Lanzar dados** |
| Ver el resultado | Aparece arriba en grande (y "¡Pares!" si salen iguales). Si un dado queda inclinado, pide volver a lanzar. |
| Empezar de nuevo | Botón **Reiniciar partida** |

Si una ficha o un dado se cae de la mesa, vuelve a su lugar de inicio.

## Piezas

- **Bloques:** cubo, ladrillo, tabla, cilindro, columna, pirámide, tejado (prisma triangular), medio cilindro, arco y esfera, en 7 colores o en "mezcla" (color al azar).
- **Parqués:** fichas (peones) de 4 colores y dados de 6 caras.

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
  bodyControl.js         Llevar un cuerpo a una pose objetivo con velocidad (controlador P)
  pieceCatalog.js        Definicion de cada pieza: geometria visual + forma fisica
  pieces.js              Crear / eliminar / sincronizar piezas en la mesa
  woodTexture.js         Textura de vetas de madera generada por codigo
  interaction.js         Agarrar, mover, rotar, soltar y tirar a la papelera
  snapping.js            Casillas imantadas: acomodar fichas en el centro de las casillas
  dice.js                Dados: texturas, lectura del resultado y lanzamiento

  boardManager.js        Cargar / cambiar de tablero
  boards/
    index.js             Registro de tableros y formato de su definicion
    freeBuild.js         Construccion libre con bloques
    parques.js           Parques: tapete, fichas, dados y casillas imantadas
    parquesLayout.js     Geometria del parques (solo datos: 68 casillas, llegadas, carceles)
    parquesTexture.js    Dibujo del tablero en un canvas

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
- **Tableros como datos:** cada juego es un objeto con su tapete, casillas, piezas iniciales y vista de cámara (`src/boards/`). Agregar un juego es crear un archivo y registrarlo en `boards/index.js`.
- **Un solo origen para dibujo y casillas:** el tablero de parqués se dibuja desde los mismos datos (`parquesLayout.js`) que definen las casillas imantadas, así siempre coinciden.
- **Casillas imantadas:** al soltar una ficha se busca el centro de casilla más cercano y la ficha se desliza ahí con el mismo controlador por velocidad que usa la mano (`bodyControl.js`), así no atraviesa a las demás.
- **Lectura de dados:** se mira cuál de los 6 ejes locales del cubo apunta más hacia arriba según la rotación del cuerpo físico. Si ninguno está a menos de 15° de la vertical, el dado quedó inclinado.
- **Preparado para multijugador:** `parquesLayout.js` no depende del navegador y `serializeTable()` en `pieces.js` exporta el estado de la mesa como JSON, para sincronizarlo por red en la siguiente fase.

### Ajustar la sensibilidad

Casi todo se calibra en `src/config.js`: umbrales del pellizco (`GESTURE.pinchIn` / `pinchOut`), zona útil de la cámara (`GESTURE.activeArea`), sensibilidad de profundidad y giro (`GRAB.depthGain`, `GRAB.rollGain`), velocidad de la cámara (`LEFT_HAND`), alcance del imán de las casillas (`SNAP.radius`), detección de los dados (`DICE`), gravedad, etc.

## Próxima fase

Multijugador en red local: servidor en Node.js con la física, sincronización del estado de la mesa por WebSocket, HTTPS para que la cámara funcione desde otros computadores y cursores de los demás jugadores.

## Tecnologías

- [Three.js](https://threejs.org) — render 3D
- [cannon-es](https://github.com/pmndrs/cannon-es) — física
- [MediaPipe Hands](https://github.com/google/mediapipe) — detección de manos (cargado desde jsDelivr)
- [Vite](https://vitejs.dev) — servidor de desarrollo y build
