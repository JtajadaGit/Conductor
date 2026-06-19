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
}
