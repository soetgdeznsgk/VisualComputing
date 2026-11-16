# Computación Visual: Mesa de juegos 3D con gestos

Mesa virtual con **juegos de mesa 3D** que se manipulan con las manos frente a la cámara, solo o **con otros jugadores en red local**. Las piezas tienen física real: caen, chocan, se apilan y se pueden lanzar.

Juegos disponibles:

- **Bloques:** construcción libre con bloques de madera (cubos, cilindros, pirámides, arcos...).
- **Parqués:** tablero colombiano de 4 colores con 16 fichas y 2 dados.
- **Ajedrez:** tablero 8 × 8 con coordenadas y las 32 piezas talladas.
- **Damas:** 12 fichas por jugador sobre las casillas oscuras.
- **Triki:** tres en línea con 5 X y 5 O.

En los juegos de mesa las casillas son **imantadas**: una pieza soltada cerca de una casilla se acomoda sola. Las reglas no están programadas; las ponen los jugadores, como en la mesa real.

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
```

### En un solo computador

```bash
npm run dev
```

Abre `http://localhost:5173` en **Chrome** y acepta el permiso de cámara. Aquí también funciona la mesa compartida entre pestañas del mismo computador.

### En red local (varios computadores)

```bash
npm run lan
```

La terminal muestra dos direcciones, por ejemplo:

```
➜  Local:   https://localhost:5173/
➜  Network: https://192.168.1.4:5173/
```

1. Todos los jugadores deben estar en la **misma red Wi-Fi** (en la universidad suele ser más seguro un hotspot del celular, porque algunas redes aíslan a los dispositivos).
2. Cada jugador abre la dirección **Network** en Chrome.
3. Como el certificado es autofirmado, Chrome muestra una advertencia: **Configuración avanzada → Continuar**. Es necesario porque los navegadores solo permiten la cámara en `localhost` o con HTTPS.
4. En el panel **Mesa compartida**, cada uno escribe su nombre y pulsa **Unirse a la mesa compartida**.
5. La primera vez, Windows puede preguntar si permite a Node.js usar la red: hay que **permitirlo en redes privadas**.

> En Windows, si PowerShell muestra *"running scripts is disabled"*, usa `npm.cmd run lan` (o `npm.cmd run dev`), o ejecuta una vez `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.

## Cómo jugar

### ✋ Mano derecha — piezas

| Gesto | Acción |
|---|---|
| Mover la mano | Mueve el cursor (anillo naranja) |
| **Pellizco** (pulgar + índice) sobre una pieza | Agarrarla |
| Acercar / alejar la mano de la cámara | Empujar la pieza al fondo / traerla |
| Girar la muñeca | Rotar la pieza |
| Abrir los dedos | Soltar (si la mano se mueve rápido, la lanza) |
| Mantener el cursor ~1 s sobre un botón | Presionarlo (elegir juego, pieza, color, etc.) |
| Soltar una pieza sobre la **papelera** | Eliminarla (solo en Bloques) |

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
| Supr | Borrar la pieza bajo el cursor (solo en Bloques) |

### 🎲 Juegos de mesa

| Juego | Qué pasa al soltar una pieza en una casilla |
|---|---|
| Parqués | Se centra; si ya hay fichas, se reparten en las esquinas (hasta 4) |
| Ajedrez | Se centra; si había una pieza **rival**, la rival se va sola a la zona de capturadas al lado del tablero |
| Damas | Se centra; si había otra ficha, se **apila** encima (dama coronada) |
| Triki | Se centra; si la casilla está ocupada, no se acomoda |

Mientras sostienes una pieza, un **anillo blanco** muestra la casilla donde va a caer. En parqués, los dados se lanzan con la mano o con el botón **Lanzar dados** y el resultado aparece arriba ("¡Pares!" si salen iguales; si un dado queda inclinado, pide volver a lanzar). **Reiniciar partida** devuelve todas las piezas a su posición inicial, y si una pieza se cae de la mesa vuelve a su lugar de inicio.

### 🌐 Mesa compartida

- Todos los jugadores ven y mueven las **mismas piezas**; cada uno tiene **su propia cámara**.
- El cursor de cada jugador se ve en la mesa con **su color y su nombre**.
- Una pieza que otro jugador tiene en la mano brilla con su color y **no se puede tomar**.
- Cualquiera puede cambiar de juego o reiniciar; todos ven el cambio.
- **Salir y jugar solo** vuelve al modo local con el mismo juego.

## Arquitectura

```
src/
  app.js                 Punto de entrada: conecta los modulos y corre el loop
  config.js              Todos los parametros ajustables (sensibilidad, fisica, camara...)

  handTracker.js         Webcam + MediaPipe Hands -> landmarks de cada mano
  gestureInterpreter.js  Landmarks -> pose (pellizco, puno, V...), cursor, profundidad, giro
  mouseInput.js          Raton/teclado con el mismo formato que la mano derecha
  interaction.js         Apuntar, agarrar, calcular la pose objetivo, soltar, papelera

  localTable.js          Mesa en este computador: corre la simulacion aqui
  remoteTable.js         Mesa compartida: habla con el servidor, interpola y predice
  pieceViews.js          Mallas de las piezas (lo que se ve)
  presence.js            Cursores de los otros jugadores
  snapPreview.js         Anillo que muestra la casilla donde caera la pieza

  scene.js               Renderer, luces, mesa de madera y tapete del tablero
  cameraRig.js           Camara orbital; la controla la mano izquierda
  woodTexture.js         Textura de vetas de madera generada por codigo
  diceTextures.js        Caras de los dados dibujadas en canvas
  pieceCatalog.js        Las 21 piezas: geometria visual + forma fisica
  ui.js / styles.css     Interfaz

  sim/                   SIMULACION COMPARTIDA (navegador y servidor, sin DOM)
    simulation.js        La mesa: piezas, manos de los jugadores, tableros, dados
    physics.js           Mundo fisico (cannon-es)
    table.js             Colisiones de la mesa
    bodyControl.js       Llevar un cuerpo a una pose con velocidad (controlador P)
    snapping.js          Casillas imantadas (modos spread / stack / capture / single)
    diceLogic.js         Leer y lanzar los dados

  boards/                TABLEROS (datos compartidos + dibujo)
    index.js             Registro y formato de un tablero
    freeBuild.js  parques.js  chess.js  checkers.js  tictactoe.js
    parquesLayout.js     Geometria del parques (68 casillas, llegadas, carceles)
    gridLayout.js        Cuadriculas N x N (ajedrez, damas, triki)
    parquesTexture.js  gridTextures.js  matTextures.js   Dibujo de los tapetes (solo navegador)

server/
  gameServer.js          Servidor del multijugador (WebSocket en /ws)
vite.config.js           Servidor de desarrollo + HTTPS para la red local
```

### Cómo funciona el multijugador

```
 Jugador A (navegador)                Servidor (Node.js)                Jugador B (navegador)
 camara -> MediaPipe -> gestos        Simulation (autoridad)            camara -> MediaPipe -> gestos
 intencion: agarrar, pose, soltar ──> aplica intenciones          <──  intencion: agarrar, pose, soltar
 dibuja la mesa (Three.js)       <──  estado 20 veces por segundo ──>  dibuja la mesa (Three.js)
```

- **Servidor con autoridad:** solo el servidor simula la física (`sim/simulation.js`, la misma clase que usa el modo local). Así no hay dos versiones de la mesa que se contradigan.
- **Solo viajan datos pequeños:** la intención de la mano de cada jugador y la posición de las piezas que se movieron. El video nunca sale del computador de cada jugador.
- **Interpolación:** cada navegador dibuja el estado de hace ~110 ms mezclando los dos últimos recibidos, para que el movimiento sea fluido aunque lleguen 20 estados por segundo.
- **Predicción:** la pieza que sostiene un jugador se dibuja en su pantalla siguiendo su mano directamente, sin esperar al servidor, para que el agarre se sienta inmediato.
- **Bloqueo:** una pieza agarrada solo la puede mover quien la tomó primero.
- **Desconexiones:** si un jugador se va, el servidor suelta lo que tenía; si se cae la red, el navegador reintenta solo.
- **Un solo comando:** el servidor de juego se conecta al mismo servidor de Vite (`vite.config.js`), en la ruta `/ws`.

### Ideas clave

- **Dos mundos sincronizados:** cannon-es calcula dónde está cada pieza y Three.js solo la dibuja.
- **Agarrar sin atravesar:** la pieza agarrada no se teletransporta al cursor. En cada paso de la física se le da la velocidad necesaria para llegar al objetivo, así sigue chocando y empujando a las demás. Al soltarla conserva esa velocidad (por eso se puede lanzar).
- **Profundidad con una sola cámara:** se usa el tamaño aparente de la palma. Si la mano se ve más grande, está más cerca de la cámara y la pieza se empuja al fondo.
- **Gestos estables:** cada pose debe repetirse varios frames seguidos para aceptarse, y el pellizco usa dos umbrales (histéresis) para no parpadear.
- **Tableros como datos:** cada juego es un objeto con su tapete, casillas, modo de imán, piezas iniciales y vista de cámara (`src/boards/`). Agregar un juego es crear un archivo y registrarlo en `boards/index.js`.
- **Piezas talladas:** las de ajedrez se generan girando una silueta (torno) y su colisión es un cilindro del mismo alto con el centro de masa bajo, para que se paren estables.
- **Lectura de dados:** se mira cuál de los 6 ejes locales del cubo apunta más hacia arriba según la rotación del cuerpo físico.
- **Sin cámara no se rompe:** si se niega el permiso, la app sigue funcionando con el ratón.

### Ajustar la sensibilidad

Casi todo se calibra en `src/config.js`: umbrales del pellizco (`GESTURE.pinchIn` / `pinchOut`), zona útil de la cámara (`GESTURE.activeArea`), sensibilidad de profundidad y giro (`GRAB.depthGain`, `GRAB.rollGain`), velocidad de la cámara (`LEFT_HAND`), alcance del imán de las casillas (`SNAP.radius`), detección de los dados (`DICE`), gravedad, etc.

### Depurar

En la consola del navegador está `mesa`: `mesa.table` es la mesa activa (`mesa.table.boardId`, `mesa.table.loadBoard('chess')`) y `mesa.rig` la cámara (`mesa.rig.reset()`). El servidor escribe en la terminal cuando un jugador entra o sale.

## Tecnologías

- [Three.js](https://threejs.org) — render 3D
- [cannon-es](https://github.com/pmndrs/cannon-es) — física
- [MediaPipe Hands](https://github.com/google/mediapipe) — detección de manos (cargado desde jsDelivr)
- [ws](https://github.com/websockets/ws) — WebSocket en el servidor
- [Vite](https://vitejs.dev) + [@vitejs/plugin-basic-ssl](https://github.com/vitejs/vite-plugin-basic-ssl) — servidor de desarrollo, build y HTTPS en red local
