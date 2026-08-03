// Bootstrap de la UI. Importa el CSS global (design system + layout) y monta el shell.
// Ultra-agile: el arranque solo trae el shell + sidebar; las pantallas entran por code-splitting (router).
import './design/theme.css';
import './design/components.css';
import './design/app.css';
import './components/app-shell';

// PWA: registra el service worker versionado (instalabilidad + offline del historial). Falla en silencio
// en navegadores sin SW o contextos no seguros (file://) — el cockpit sigue funcionando igual.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  // RELEVO SIN QUEDARSE ATRÁS (bug real): tras un redeploy, la recarga del auto-relevo aún la
  // servía el SW VIEJO (assets cache-first) y el SW nuevo activaba DESPUÉS borrando esa caché → la pestaña
  // quedaba UNA RECARGA POR DETRÁS para siempre y los chunks viejos daban 404 (CSS a medias, texto crudo).
  // Patrón estándar: cuando el SW nuevo TOMA EL CONTROL (clients.claim), recarga ÚNICA — todo sale ya del
  // build nuevo. Guard doble: ni bucle (una vez) ni recarga en la PRIMERA visita (aún no había controller).
  let hadSw = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadSw) { hadSw = true; return; }
    hadSw = false; // tras esta recarga el flujo empieza de cero
    location.reload();
  });
}
