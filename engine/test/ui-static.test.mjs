// ui-static.test.mjs — el servidor de estáticos del panel. Aquí nacen los 404 de chunks que dejaron la app
// en blanco y al servir ficheros del disco es superficie de travesía de rutas. Se prueba con
// un `res` de mentira: sin sockets, sin puertos, sin esperas.
import { serveStatic, uiStaticDir, hasStaticUi } from '../lib/serving/ui-static.mjs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = join(HERE, '.tmp-uistatic');
const UI = join(BASE, 'ui');
rmSync(BASE, { recursive: true, force: true });
mkdirSync(join(UI, 'assets'), { recursive: true });
writeFileSync(join(UI, 'index.html'), '<!doctype html><title>panel</title>');
writeFileSync(join(UI, 'assets', 'index-abc123.js'), 'export const x=1;');
writeFileSync(join(UI, 'assets', 'index-abc123.css'), 'body{}');
writeFileSync(join(UI, 'assets', 'logo.svg'), '<svg/>');
mkdirSync(join(UI, 'assets', 'subdir'), { recursive: true });
// vecino FUERA de uiDir cuyo nombre EMPIEZA igual: caza el confinamiento hecho con startsWith a secas
mkdirSync(join(BASE, 'ui-vecino'), { recursive: true });
writeFileSync(join(BASE, 'ui-vecino', 'secreto.js'), 'SECRETO');
writeFileSync(join(BASE, 'fuera.txt'), 'FUERA');

// `res` de mentira que registra lo que le hacen
const fakeRes = () => ({ code: 0, headers: null, body: null, writeHead(c, h) { this.code = c; this.headers = h || null; }, end(b) { this.body = b == null ? '' : String(b); } });
const pedir = (pathname, method = 'GET') => { const res = fakeRes(); const handled = serveStatic({ uiDir: UI, pathname, method, res }); return { handled, ...res }; };

await test('ui-static: hasStaticUi exige index.html Y assets/ (distingue el BUILD de la fuente Vite)', () => {
  assert(hasStaticUi(UI), 'con index.html + assets/ es una UI compilada');
  const soloIndex = join(BASE, 'solo-index');
  mkdirSync(soloIndex, { recursive: true });
  writeFileSync(join(soloIndex, 'index.html'), 'x');
  assert(!hasStaticUi(soloIndex), 'con index.html pero SIN assets/ es la fuente, no el build');
  assert(!hasStaticUi(join(BASE, 'no-existe')), 'un dir inexistente no es una UI');
  assert(!hasStaticUi(null) && !hasStaticUi(undefined), 'entradas nulas no revientan');
  assert(String(uiStaticDir('/x/assets/conductor.mjs')).endsWith('ui'), 'la UI vive junto al bundle');
});

await test('ui-static: sirve los assets hasheados con su content-type y cache inmutable', () => {
  const js = pedir('/assets/index-abc123.js');
  assert(js.handled); eq(js.code, 200);
  assert(/javascript/.test(js.headers['content-type']), `content-type de JS: ${js.headers['content-type']}`);
  assert(/immutable/.test(js.headers['cache-control']), 'los hasheados son inmutables: cache larga');
  eq(pedir('/assets/index-abc123.css').headers['content-type'], 'text/css; charset=utf-8');
  eq(pedir('/assets/logo.svg').headers['content-type'], 'image/svg+xml');
});

await test('ui-static: un chunk que YA NO EXISTE da 404 limpio (el caso que dejó la app en blanco)', () => {
  const r = pedir('/assets/run-screen-BORRADO.js');
  assert(r.handled, 'lo maneja él, no cae al catch-all de la SPA');
  eq(r.code, 404, 'y es 404, no un index.html disfrazado de JS');
  assert(!/doctype/i.test(r.body), 'JAMÁS devolver HTML donde el navegador espera un módulo JS');
});

await test('ui-static: un directorio bajo /assets/ no se sirve como fichero', () => {
  const r = pedir('/assets/subdir');
  assert(r.handled); eq(r.code, 404, 'un directorio no es un fichero servible');
});

await test('ui-static: TRAVESÍA de rutas — nada fuera de uiDir sale, en ninguna de sus formas', () => {
  const intentos = [
    '/assets/../fuera.txt',
    '/assets/../../fuera.txt',
    '/assets/../ui-vecino/secreto.js',   // vecino con prefijo igual: el fallo clásico de startsWith
    '/assets/..%2f..%2ffuera.txt',
    '/assets/....//fuera.txt',
    '/assets/./../fuera.txt',
    '/assets//../fuera.txt',
  ];
  for (const p of intentos) {
    const r = pedir(p);
    assert(r.handled, `${p}: debe manejarlo el estático`);
    assert(r.code === 403 || r.code === 404, `${p}: debe rechazarse (dio ${r.code})`);
    assert(!/SECRETO|FUERA/.test(r.body || ''), `${p}: FILTRÓ contenido de fuera de uiDir`);
  }
});

await test('ui-static: las rutas de NAVEGACIÓN reciben el index.html (el router del cliente resuelve)', () => {
  for (const p of ['/', '/run/proyecto~abc123/mi-cambio', '/ahorro', '/flow', '/ruta/que/no/existe']) {
    const r = pedir(p);
    assert(r.handled, `${p} debe recibir la SPA`);
    eq(r.code, 200);
    assert(/doctype/i.test(r.body), `${p} debe recibir index.html`);
    assert(/no-cache/.test(r.headers['cache-control']), 'el shell NUNCA se cachea (si no, tras un deploy sirve chunks muertos)');
  }
});

// Un id de proyecto es `<basename>~<hash6>`, así que un repo llamado `mi.app` produce `/run/mi.app~ab12cd`.
// Descartando por "tiene un punto", esa ruta se tomaba por un fichero, caía al motor y el usuario veía
// «Interfaz no compilada» con la UI compilada delante. Ahora el descarte es por extensión CONOCIDA.
await test('ui-static: una ruta de navegación con PUNTO (repo llamado mi.app) recibe la SPA, no el fallback falso', () => {
  for (const p of ['/run/mi.app~ab12cd', '/run/site.com~001122/mi-cambio', '/session/sess.1234', '/proyecto.v2']) {
    const r = pedir(p);
    assert(r.handled, `${p}: debe recibir la SPA`);
    assert(/doctype/i.test(r.body), `${p}: debe recibir index.html`);
  }
});

await test('ui-static: NO secuestra las rutas del motor (/api, /artifact, /events siguen su curso)', () => {
  for (const p of ['/api/state', '/api/run/x/state', '/artifact/spec.md', '/events']) {
    eq(pedir(p).handled, false, `${p} lo tiene que atender el motor, no el estático`);
  }
  // y las rutas del motor CON extensión conocida siguen pasando de largo tras el cambio de regla
  for (const p of ['/manifest.json', '/sw.js', '/icon.svg']) {
    eq(pedir(p).handled, false, `${p} lo sirve el motor (su extensión sí está en TYPES)`);
  }
});

await test('ui-static: solo atiende GET — un POST a una ruta de navegación no devuelve la SPA', () => {
  for (const m of ['POST', 'PUT', 'DELETE', 'HEAD']) eq(pedir('/', m).handled, false, `${m} no lo sirve el estático`);
});

rmSync(BASE, { recursive: true, force: true });
