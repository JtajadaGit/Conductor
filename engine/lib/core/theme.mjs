// conductor/lib/theme.mjs — SISTEMA DE DISEÑO ÚNICO (una sola fuente de verdad para las 4 pantallas:
// panel, run, dashboard, aiact). Antes cada página tenía su CSS y derivaban (paletas dobles, una blanca
// y otra oscura...). Aquí viven los tokens, el modo oscuro y los componentes base. Contraste AA cuidado.
export const THEME = `
 :root{
  color-scheme:light;
  /* tx3/verdicts oscurecidos un punto para despejar AA 4.5 en los informes (paridad con la SPA theme.css:
     antes 4.3-4.45 sobre su tinte). Los *bg quedan igual — la identidad visual no cambia. */
  --tx:#0f1822;--tx2:#46556a;--tx3:#566073;--bd:#e1e8f0;--bd2:#eef2f7;
  --bg:#f6f8fb;--bg2:#eaf0f6;--card:#ffffff;
  --ok:#0b6b57;--okbg:#daf0e9;--bad:#af2a24;--badbg:#fbe3e1;--warn:#795009;--warnbg:#f6ecd4;
  --accent:#1d5ae0;--accent2:#5b93ff;--accentbg:#e7efff; /* sync ui/theme.css: acento-texto ≥4.5 sobre tintes */
  --sh:0 1px 2px rgba(15,30,55,.06),0 2px 8px rgba(15,30,55,.05);
  --shlg:0 6px 22px rgba(15,30,55,.10),0 20px 48px rgba(15,30,55,.10);--r:11px;
  --font:"Inter var",Inter,-apple-system,"Segoe UI Variable","Segoe UI",ui-sans-serif,system-ui,sans-serif;
  --mono:ui-monospace,"Cascadia Code","SF Mono","JetBrains Mono",Menlo,Consolas,monospace;
 }
 /* dark: toggle explícito (data-theme) + fallback OS preference */
 :root[data-theme="dark"]{
  color-scheme:dark;
  --tx:#e9eff6;--tx2:#9fb0c1;--tx3:#637282;--bd:#222d3a;--bd2:#19212b;
  --bg:#0b0f14;--bg2:#161d27;--card:#121922;
  --ok:#2eb792;--okbg:#0f2c26;--bad:#f0625a;--badbg:#2f1b1b;--warn:#dca044;--warnbg:#2c2413;
  --accent:#4c86ff;--accent2:#7aa8ff;--accentbg:#15233d;
  --sh:0 1px 2px rgba(0,0,0,.4),0 2px 10px rgba(0,0,0,.3);
  --shlg:0 10px 30px rgba(0,0,0,.55),0 30px 70px rgba(0,0,0,.6);
 }
 @media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  color-scheme:dark;
  --tx:#e9eff6;--tx2:#9fb0c1;--tx3:#637282;--bd:#222d3a;--bd2:#19212b;
  --bg:#0b0f14;--bg2:#161d27;--card:#121922;
  --ok:#2eb792;--okbg:#0f2c26;--bad:#f0625a;--badbg:#2f1b1b;--warn:#dca044;--warnbg:#2c2413;
  --accent:#4c86ff;--accent2:#7aa8ff;--accentbg:#15233d;
  --sh:0 1px 2px rgba(0,0,0,.4),0 2px 10px rgba(0,0,0,.3);
  --shlg:0 10px 30px rgba(0,0,0,.55),0 30px 70px rgba(0,0,0,.6);
 }}
 *{box-sizing:border-box}
 ::selection{background:var(--accentbg);color:var(--tx)}
 body{font:14.5px/1.6 var(--font);color:var(--tx);background:var(--bg);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
 a{color:var(--accent);text-underline-offset:2px}
 h1{font-size:1.5rem;line-height:1.15;letter-spacing:-.022em;font-weight:680;margin:.1rem 0}
 h2{font-size:1.02rem;letter-spacing:-.012em;font-weight:640;margin:1.6rem 0 .55rem}
 code{background:var(--bg2);border:1px solid var(--bd2);border-radius:6px;padding:.05rem .36rem;font:.84em var(--mono);color:var(--tx)}
 /* pills de estado — el verdict se lee de un vistazo; misma voz que la cabina */
 .pill{display:inline-flex;align-items:center;gap:.38rem;font:700 .66rem/1 var(--mono);letter-spacing:.06em;padding:.26rem .55rem;border-radius:7px;text-transform:uppercase;white-space:nowrap;border:1px solid transparent}
 .pill::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
 .pill.GREEN{background:var(--okbg);color:var(--ok);border-color:var(--ok)}
 .pill.CURSO,.pill.run,.pill.RUNNING{background:var(--warnbg);color:var(--warn);border-color:var(--warn)}
 .pill.CURSO::before{animation:pulse 1.4s ease-in-out infinite}
 .pill.NOT-GREEN,.pill.ABORTED,.pill.STOPPED,.pill.INTERRUMPIDO,.pill.bad,.pill[class*=BLOCK]{background:var(--badbg);color:var(--bad);border-color:var(--bad)}
 .pill.G,.pill.neutral{background:var(--bg2);color:var(--tx3);border-color:var(--bd)}
 @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
 /* cards métricas — readout de instrumento (label mono, número tabular) */
 .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:.65rem;margin:0 0 1.4rem}
 .card{border:1px solid var(--bd);border-radius:var(--r);padding:.7rem .85rem;background:var(--card);box-shadow:var(--sh)}
 .card small{display:block;color:var(--tx3);font:700 .6rem/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;margin-bottom:.4rem}
 .card span,.card b{font-size:1.15rem;font-weight:640;font-variant-numeric:tabular-nums;letter-spacing:-.015em;display:block;color:var(--tx)}
 .card.ok b,.card.ok span{color:var(--ok)} .card.no b,.card.no span{color:var(--bad)} .card.warn b{color:var(--warn)}
 /* botones */
 .btn{display:inline-flex;align-items:center;gap:.4rem;background:var(--accent);color:#fff;border:1px solid transparent;border-radius:8px;padding:.46rem .9rem;font:600 .82rem var(--font);cursor:pointer;text-decoration:none;box-shadow:var(--sh);transition:filter .14s,transform .14s}
 .btn:hover{filter:brightness(1.06);transform:translateY(-1px)}
 .btn.sec{background:var(--bg2);color:var(--tx);border-color:var(--bd);box-shadow:none}
 .btn.sec:hover{background:var(--card);border-color:var(--accent)}
 .btn.sm{padding:.3rem .62rem;font-size:.76rem}
 /* tablas */
 table{border-collapse:collapse;width:100%;font-size:.88em;background:var(--card);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;box-shadow:var(--sh)}
 th{text-align:left;padding:.45rem .7rem;background:var(--bg2);color:var(--tx2);font:700 .66rem/1 var(--mono);letter-spacing:.05em;text-transform:uppercase}
 td{padding:.45rem .7rem;border-top:1px solid var(--bd2);vertical-align:top}
 tr.gap td{background:var(--badbg)}
 .tick{display:inline-flex;width:1.3rem;height:1.3rem;align-items:center;justify-content:center;border-radius:6px;font-size:.72rem;font-weight:800}
 .tick.y{background:var(--okbg);color:var(--ok)} .tick.n{background:var(--badbg);color:var(--bad)}
 /* barra de progreso (AIC, etc.) */
 .pbar{height:6px;border-radius:6px;background:var(--bd2);overflow:hidden;margin-top:.35rem}
 .pbar>i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,var(--accent),var(--accent2))}
 .pbar.warn>i{background:linear-gradient(90deg,var(--warn),var(--bad))}
 :focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:5px}
 @media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}
 .sect{font:600 .68rem/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--tx3);margin:1.7rem 0 .6rem;display:flex;align-items:center;gap:.5rem}
 .sect::before{content:'';width:14px;height:2px;border-radius:2px;background:var(--accent);opacity:.8}
 footer{margin-top:2.2rem;color:var(--tx3);font-size:.78rem;border-top:1px solid var(--bd);padding-top:.9rem}
 /* toggle dark/light — mismo chip que la SPA */
 .thm-tog{position:fixed;top:.8rem;right:.9rem;z-index:30;display:inline-grid;place-items:center;width:2.1rem;height:2.1rem;border-radius:9px;background:var(--card);border:1px solid var(--bd);color:var(--tx2);cursor:pointer;box-shadow:var(--sh);transition:color .15s,border-color .15s;font-size:1rem;line-height:1}
 .thm-tog:hover{color:var(--accent);border-color:var(--accent)}
 .thm-tog .tg-sun{display:none}
 [data-theme=dark] .thm-tog .tg-sun{display:block}
 [data-theme=dark] .thm-tog .tg-moon{display:none}
`;

// Botón de tema para las páginas HTML generadas (informe, AI Act): MISMO icono sol/luna de trazo que la
// SPA (theme-toggle.ts), nada de glifos/emoji — qué SVG se ve lo decide el CSS de arriba según data-theme.
export const THEME_TOGGLE = `<button class="thm-tog" id="thm" aria-label="Cambiar tema" title="Claro/Oscuro"><svg class="tg-sun" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg><svg class="tg-moon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg></button>`;
