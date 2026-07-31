import { html, type TemplateResult } from 'lit';

/** Iconos del cockpit (dirección UX 2026-07-31: "me gustaban los iconos, siempre con sentido y gusto").
 * NO emojis (rompían en tamaño/color entre plataformas): SVG de TRAZO monocromo, 14px, `currentColor` —
 * heredan la voz del botón donde viven (secundaria tranquila, primaria en acento) sin añadir color propio.
 * Uno por ACCIÓN, solo donde el icono significa algo; jamás decoración. */
const P = (d: string): TemplateResult => html`<svg class="bi" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${d}></path></svg>`;

export const ICONS: Record<string, TemplateResult> = {
  play: P('M7 5v14l12-7z'),                                                       // reanudar: continuar la partitura
  stop: P('M7 7h10v10H7z'),                                                       // detener
  session: P('M4 5h16M4 12h10M4 19h7'),                                           // ver sesión: líneas de traza
  report: P('M5 20V10m7 10V4m7 16v-7'),                                           // informe: barras
  shield: P('M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z'),                            // AI Act: escudo
  archive: P('M4 8h16M6 8V6h12v2M6 8v10h12V8M10 12h4'),                           // archivar: caja con asa
  copy: P('M9 9h10v12H9zM5 15V3h10'),                                             // copiar descripción de PR
  undo: P('M9 14L4 9l5-5M4 9h11a5 5 0 015 5v0a5 5 0 01-5 5h-4'),                  // deshacer: vuelta atrás
  redo: P('M15 4l5 5-5 5M20 9H9a5 5 0 00-5 5v0a5 5 0 005 5h4'),                   // rehacer fase
  doc: P('M13 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM13 3v6h7'),       // abrir documento (.md)
  edit: P('M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z'),                  // editar: lápiz
  save: P('M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8'), // guardar
  wrench: P('M14.7 6.3a4.8 4.8 0 016.1-6 1 1 0 01.3 1.6l-2.6 2.6 1 1 2.6-2.6a1 1 0 011.6.3 4.8 4.8 0 01-6 6.1L9 18a2.1 2.1 0 11-3-3z'), // tools de la sesión
  chat: P('M21 12a8 8 0 01-8 8 8.2 8.2 0 01-3.6-.8L4 21l1.8-5.4A8 8 0 1121 12z'), // mensajes
  key: P('M15 9a6 6 0 10-5.7 8L21 5.3V3h-2.3z M15 9l2 2'),                        // permisos: llave
  bot: P('M12 3v3M6 6h12a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2zM9.5 11h.01M14.5 11h.01M9 15h6'), // subagentes
  lock: P('M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1zM8 11V7a4 4 0 018 0v4'), // fase obligatoria (gobierno)
  pause: P('M9 5v14M15 5v14'),                                                    // run en pausa: espera tu decisión
  folder: P('M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z'), // proyecto
  panel: P('M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2M9 2h6a1 1 0 011 1v2a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z'), // panel: portapapeles
  warn: P('M10.3 3.9L1.8 18a2 2 0 001.7 3h16.9a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01'), // aviso (badge warn)
  eye: P('M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z'), // contexto del agente: lo que vio
  terminal: P('M4 17l6-5-6-5M12 19h8'),                                            // salida del modelo: voz de terminal
  buoy: P('M12 2a10 10 0 100 20 10 10 0 000-20zM12 8a4 4 0 100 8 4 4 0 000-8zM5 5l4.2 4.2M14.8 14.8L19 19M14.8 9.2L19 5M9.2 14.8L5 19'), // fallback: salvavidas
};

export const icon = (name: keyof typeof ICONS): TemplateResult => ICONS[name] ?? html``;
