// conductor/lib/theme.mjs — SISTEMA DE DISEÑO ÚNICO (una sola fuente de verdad para las 4 pantallas:
// panel, run, dashboard, aiact). Antes cada página tenía su CSS y derivaban (paletas dobles, una blanca
// y otra oscura...). Aquí viven los tokens, el modo oscuro y los componentes base. Contraste AA cuidado.
export const THEME = `
 :root{
  --tx:#1f1e1c;--tx2:#6b6964;--tx3:#94918b;--bd:#e7e5e0;--bd2:#f0eee9;
  --bg:#fcfbf9;--bg2:#f4f2ee;--card:#fff;
  --ok:#0f7b6c;--okbg:#dcefe8;--bad:#bc3f3a;--badbg:#fbe4e2;--warn:#9a6411;--warnbg:#f7ebd4;
  --accent:#6e56cf;--accent2:#2680eb;--accentbg:#efeafc;
  --sh:0 1px 2px rgba(20,20,30,.05),0 4px 14px rgba(20,20,30,.06);
  --shlg:0 8px 24px rgba(20,20,30,.10),0 24px 60px rgba(20,20,30,.12);--r:10px;
  --font:-apple-system,"Segoe UI Variable","Segoe UI",Inter,ui-sans-serif,system-ui,sans-serif;
  --mono:ui-monospace,"Cascadia Code","SF Mono",Menlo,monospace;
 }
 @media (prefers-color-scheme: dark){:root{
  --tx:#edebe7;--tx2:#a8a59f;--tx3:#76736e;--bd:#36332f;--bd2:#2a2825;
  --bg:#181715;--bg2:#211f1d;--card:#201e1c;
  --okbg:#10362e;--badbg:#3c211f;--warnbg:#382c16;--accentbg:#272138;
  --sh:0 1px 2px rgba(0,0,0,.3),0 4px 14px rgba(0,0,0,.25);
  --shlg:0 10px 30px rgba(0,0,0,.5),0 30px 70px rgba(0,0,0,.55);
 }}
 *{box-sizing:border-box}
 ::selection{background:var(--accentbg)}
 body{font:14px/1.55 var(--font);color:var(--tx);background:var(--bg);-webkit-font-smoothing:antialiased}
 a{color:var(--accent2)}
 h1{font-size:1.4rem;letter-spacing:-.018em;font-weight:700;margin:.1rem 0}
 h2{font-size:1rem;letter-spacing:-.01em;margin:1.5rem 0 .5rem}
 code{background:var(--bg2);border:1px solid var(--bd2);border-radius:5px;padding:.06rem .35rem;font:.85em var(--mono)}
 /* pills de estado — contraste AA, mismo lenguaje en las 4 pantallas */
 .pill{display:inline-flex;align-items:center;gap:.35rem;font-size:.7rem;font-weight:700;letter-spacing:.04em;padding:.2rem .6rem;border-radius:999px;text-transform:uppercase;white-space:nowrap}
 .pill::before{content:'';width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.9}
 .pill.GREEN{background:var(--okbg);color:var(--ok)}
 .pill.CURSO,.pill.run,.pill.RUNNING{background:var(--warnbg);color:var(--warn)}
 .pill.CURSO::before{animation:pulse 1.5s infinite}
 .pill.NOT-GREEN,.pill.ABORTED,.pill.STOPPED,.pill.INTERRUMPIDO,.pill.bad{background:var(--badbg);color:var(--bad)}
 .pill.G,.pill.neutral{background:var(--bg2);color:var(--tx3)}
 @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
 /* cards métricas — jerarquía label/valor unificada */
 .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(124px,1fr));gap:.6rem;margin:0 0 1.3rem}
 .card{border:1px solid var(--bd);border-radius:var(--r);padding:.6rem .8rem;background:var(--card);box-shadow:var(--sh)}
 .card small{display:block;color:var(--tx3);font-size:.64rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;margin-bottom:.25rem}
 .card span,.card b{font-size:1.05rem;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:-.01em;display:block;color:var(--tx)}
 .card.ok b,.card.ok span{color:var(--ok)} .card.no b,.card.no span{color:var(--bad)} .card.warn b{color:var(--warn)}
 /* botones — un solo estilo en todas las pantallas */
 .btn{display:inline-flex;align-items:center;gap:.35rem;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:.4rem .85rem;font:600 .82rem var(--font);cursor:pointer;text-decoration:none;box-shadow:var(--sh);transition:filter .15s,transform .15s}
 .btn:hover{filter:brightness(1.08);transform:translateY(-1px)}
 .btn.sec{background:var(--bg2);color:var(--tx);border:1px solid var(--bd);box-shadow:none}
 .btn.sec:hover{background:var(--card);border-color:var(--accent)}
 .btn.sm{padding:.26rem .6rem;font-size:.76rem}
 /* tablas */
 table{border-collapse:collapse;width:100%;font-size:.88em;background:var(--card);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;box-shadow:var(--sh)}
 th{text-align:left;padding:.4rem .65rem;background:var(--bg2);color:var(--tx2);font-size:.72rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase}
 td{padding:.4rem .65rem;border-top:1px solid var(--bd2);vertical-align:top}
 tr.gap td{background:var(--badbg)}
 .tick{display:inline-flex;width:1.25rem;height:1.25rem;align-items:center;justify-content:center;border-radius:5px;font-size:.72rem;font-weight:800}
 .tick.y{background:var(--okbg);color:var(--ok)} .tick.n{background:var(--badbg);color:var(--bad)}
 /* barra de progreso (AIC, etc.) */
 .pbar{height:6px;border-radius:4px;background:var(--bd2);overflow:hidden;margin-top:.3rem}
 .pbar>i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,var(--accent),var(--accent2))}
 .pbar.warn>i{background:linear-gradient(90deg,var(--warn),var(--bad))}
 :focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
 @media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}
 .sect{font-size:.7rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--tx3);margin:1.6rem 0 .5rem}
 footer{margin-top:2.2rem;color:var(--tx3);font-size:.78rem;border-top:1px solid var(--bd);padding-top:.9rem}
`;
