import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Proyecto autocontenido en ui/ (deps propias). Compila a ../assets/ui (artefacto que sirve el motor 0-dep).
// El usuario final NO instala nada: esto es solo build-time. base:'/' = rutas ABSOLUTAS de assets: imprescindible
// para una SPA con rutas profundas (/run/<proj>/<change>) — con base relativa el bundle se pedía a
// /run/<proj>/assets/* → 404 → página en blanco al recargar/deep-link un run. (Bug encontrado en pruebas reales.)
const here = dirname(fileURLToPath(import.meta.url));
const ENGINE = 'http://127.0.0.1:4750'; // motor real en dev (node assets/conductor.mjs serve .)

export default defineConfig({
  root: here,
  base: '/',
  build: {
    outDir: resolve(here, '..', 'assets', 'ui'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    port: 5173,
    // En dev se proxan SOLO los prefijos de DATOS al motor; /run y /demo los maneja el router SPA de Vite.
    proxy: {
      '/api': ENGINE,
      '/artifact': ENGINE,
      '/manifest.json': ENGINE,
      '/icon.svg': ENGINE,
    },
  },
});
