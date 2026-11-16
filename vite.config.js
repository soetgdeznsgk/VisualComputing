// ============================================================
// vite.config.js — Servidor de desarrollo
// ============================================================
//   npm run dev  -> http://localhost:5173 (un computador; el multijugador
//                   tambien funciona entre pestanas del mismo computador)
//   npm run lan  -> https://<ip-de-este-computador>:5173 para jugar en red
//                   local. Usa HTTPS (certificado autofirmado) porque los
//                   navegadores solo permiten la camara en localhost o HTTPS.
//
// En ambos casos el servidor del multijugador (server/gameServer.js) se
// conecta al mismo servidor de Vite, en la ruta /ws: un solo comando y un
// solo puerto.
// ============================================================

import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { attachGameServer } from './server/gameServer.js';

/** Plugin: agrega el servidor de juego al servidor de Vite. */
function gameServer() {
  return {
    name: 'mesa-game-server',
    configureServer(server) {
      if (server.httpServer) attachGameServer(server.httpServer);
    },
    configurePreviewServer(server) {
      if (server.httpServer) attachGameServer(server.httpServer);
    },
  };
}

export default defineConfig(({ mode }) => {
  const lan = mode === 'lan';
  return {
    plugins: [gameServer(), ...(lan ? [basicSsl()] : [])],
    server: { host: lan, port: 5173 },
    preview: { host: lan, port: 4173 },
  };
});
