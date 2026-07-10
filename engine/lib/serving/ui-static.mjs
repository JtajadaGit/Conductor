// engine/lib/serving/ui-static.mjs — sirve la UI compilada (Vite+Lit) desde assets/ui. Es la ÚNICA UI:
// si no existe el build, el motor muestra un fallback mínimo "compila la UI" (ya NO hay UI inline legacy).
// La UI es solo build-time (Vite/Lit/TS): aquí no hay dependencias, solo fs/path nativos.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, normalize, extname } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.map': 'application/json',
  '.ico': 'image/x-icon', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

// la UI compilada vive junto al bundle del motor: assets/conductor.mjs → assets/ui
export function uiStaticDir(enginePath) {
  try { return join(dirname(enginePath), 'ui'); } catch { return null; }
}
// "construida" = index.html + el subdir assets/ (salida hasheada de Vite). Exigir AMBOS distingue la UI
// COMPILADA (assets/ui) de la FUENTE Vite (ui/, que tiene index.html pero no ui/assets/) → en tests, donde
// el engine path no tiene una UI construida al lado, no se activa por error. Permite hacer Vite el DEFAULT.
export function hasStaticUi(uiDir) {
  try { return !!uiDir && existsSync(join(uiDir, 'index.html')) && existsSync(join(uiDir, 'assets')); } catch { return false; }
}

// Sirve la SPA compilada. Devuelve true si manejó la request:
//  - /assets/*           → fichero hasheado, Cache-Control immutable (confinado a uiDir)
//  - rutas de navegación → index.html (el router client-side resuelve la pantalla)
// Devuelve false para /api/*, /artifact/*, /manifest.json, /icon.svg, etc. → siguen su curso normal.
export function serveStatic({ uiDir, pathname, method, res }) {
  if (!uiDir || method !== 'GET') return false;
  const indexPath = join(uiDir, 'index.html');
  if (!existsSync(indexPath)) return false;
  if (pathname.startsWith('/assets/')) {
    const rel = normalize(pathname).replace(/^[/\\]+/, '');
    const file = join(uiDir, rel);
    if (!file.startsWith(uiDir)) { res.writeHead(403); res.end('forbidden'); return true; } // confinamiento
    if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return true; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable' });
    res.end(readFileSync(file));
    return true;
  }
  if (pathname === '/' || pathname === '/demo' || pathname === '/help' || pathname === '/flow' || pathname === '/ahorro' || pathname.startsWith('/run/') || pathname.startsWith('/session/')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(readFileSync(indexPath));
    return true;
  }
  return false;
}
