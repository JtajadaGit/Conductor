# Evaluación de ingeniería del engine — ¿es productivo de verdad? (2026-06-12)

> Pregunta de Jorge: ¿JS o TS? ¿anidamiento? ¿buenas prácticas para engine/HTML/CSS/JS/TS/Py?
> Evaluación honesta del estado actual (perfil AI senior), con decisión por punto.

## 0. Estado actual (medido)
- `engine/`: 13 módulos `.mjs`, ~4.000 LOC de lib + 457 (bin) + tests. **0 dependencias runtime** (esbuild solo devDep para el bundle del SDK). Se empaqueta a `assets/conductor.mjs` (single-file) con un bundler propio de ~70 líneas.
- Tests: 133 unit + e2e offline en CI 3 SO. **Esto es lo que sostiene la velocidad** — cada refactor se valida solo.
- **Punto caliente**: `lib/serve.mjs` = **1.004 LOC** con TODO el HTML/CSS/JS de 4 páginas embebido como template strings. Es el origen real de los glitches visuales recientes (paletas duplicadas, JS que no compila por una comilla, regex roto en template). El resto de módulos están sanos (<550 LOC, una responsabilidad cada uno).

## 1. ¿JS o TS para el engine? → **JS con JSDoc + `checkJs`, NO migrar a TS**
**Razón de producto, no de gusto:** el motor se entrega como **MCP server bundled en un plugin, 0 deps, single-file**. TS metería un paso de compilación obligatorio (tsc) en el camino de release y arriesga la regla dura "0 deps / portable". El valor de TS (tipos) se consigue al 80% **sin compilar** con:
- `// @ts-check` + **JSDoc** en los módulos núcleo (drive, orchestrate, contract, provenance) → el editor y un `tsc --noEmit` en CI dan el chequeo de tipos **sin emitir nada**.
- `engine/tsconfig.json` con `{ "checkJs": true, "noEmit": true, "allowJs": true }` solo para CI/dev.
**Veredicto:** mantener `.mjs`, añadir JSDoc+checkJs en los 5 módulos críticos. Coste bajo, red de seguridad de tipos, cero impacto en el empaquetado. Migrar a TS solo si algún día el engine se publica como paquete npm independiente.

## 2. El problema REAL no es JS vs TS — es el HTML-en-string de serve.mjs
1.004 líneas con CSS y JS de cliente como literales `\`...\`` es lo que ha causado los fallos visuales:
- el linter/tsc no ve dentro del string → errores de sintaxis JS llegan a runtime ("cargando…" mudo),
- regex/`${}` chocan con el template (`API.match(//...)` roto),
- paletas duplicadas porque el CSS vive en 2 sitios (ya mitigado con `theme.mjs`).
**Recomendación (deuda técnica prioritaria, V4):**
- **`lib/ui/`**: separar `theme.css`, `panel.js`, `run.js`, `panel.html`, `run.html` como ASSETS reales (archivos), no strings. El build los inserta. Así: resaltado de sintaxis, lint de CSS/JS, y el render-test compila ficheros de verdad.
- **Validación en CI** del JS de cliente con `node --check` por archivo (ya lo hace el harness de render parcialmente; formalizarlo por archivo).
- NO meter framework (React/Vue): rompe "0 deps". HTML+CSS+JS vanilla está bien para esta escala; el problema es la *organización en strings*, no la tecnología.

## 3. Anidamiento / estilo JS
- **drive.mjs (545 LOC)** está al límite: una función `drive()` larga con closures. Funciona y está testeada, pero conviene extraer (a) la captura git/fs, (b) el bucle de fase, (c) el sellado, a funciones nombradas top-level. Reduce anidamiento y facilita el chat-con-fase (V4-P2).
- Regla a fijar: **early-return > else anidado**; funciones <60 LOC; nada de callbacks de 3 niveles. El resto del engine ya lo cumple.
- Mantener el patrón actual: módulos pequeños de una responsabilidad + `report.mjs` como formato común. Es buena arquitectura.

## 4. Buenas prácticas por lenguaje (a fijar en CLAUDE.md / CI)
- **JS/.mjs**: `// @ts-check`+JSDoc en núcleo · ESM siempre · `execFileSync` (nunca `execSync` con interpolación — ya migrado por seguridad) · funciones puras y testeables · 0 deps runtime.
- **HTML**: salir de los template-strings a archivos `lib/ui/*.html`; `lang`, roles ARIA, `<label>` por input (ya hecho en el form), foco visible (ya), `prefers-reduced-motion` (ya).
- **CSS**: un único sistema de tokens (`theme.mjs` → idealmente `theme.css`); contraste AA (revisar `--tx3` sobre `--bg2`); `clamp()` para spacing responsive (ya introducido); evitar estilos inline repetidos (migrar a clases).
- **TS** (si entra, p.ej. en el runner SDK o un futuro paquete): `strict:true`, sin `any`, tipos en los contratos públicos.
- **Py**: solo existe el `custom_callbacks.py` del proxy (no desplegado). Si se usa: `ruff`+`black`, type hints, sin estado global. No es ruta crítica.

## 5. Herramientas que SÍ vale la pena añadir (sin romper 0-deps runtime)
| Herramienta | Para qué | Coste |
|---|---|---|
| `tsc --noEmit` (checkJs) en CI | tipos sin compilar | devDep, alto ROI |
| Prettier + ESLint (flat config) en CI | estilo/anidamiento consistentes | devDep |
| `node --check` por archivo de cliente | cazar el "cargando… mudo" antes de runtime | 0 deps |
| Separar `lib/ui/` a assets | fin de los glitches de string | refactor, sin deps |

## 6. Veredicto
**El engine ES productivo y la arquitectura núcleo es sólida** (0 deps, módulos pequeños, 133 tests, e2e en CI — eso es lo que ha permitido iterar tan rápido). **NO migrar a TS** (rompería el empaquetado; usar JSDoc+checkJs). **La única deuda técnica real es `serve.mjs`**: sacar HTML/CSS/JS de los strings a `lib/ui/` es el refactor de mayor impacto en calidad y el que elimina la clase de bug visual que llevamos arrastrando. Lo dejo como **V4-P5 (deuda técnica prioritaria)**.
