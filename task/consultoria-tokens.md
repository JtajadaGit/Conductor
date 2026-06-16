# Consultoría de ahorro de tokens — conductor (2026-06-11)

> Datos REALES de los runs de Jorge (OTel por fase): run GREEN completo = **3.455M↓ / 38.7k↑** (4 fases,
> 14m21s); propose ≈433k↓, spec ≈510k↓, apply ≈1.083M↓/16.2k↑. Ratio entrada:salida ≈ **90:1** →
> **el coste vive en la ENTRADA** (el agente leyendo contexto), no en lo que escribe.

## 1. Dónde se van los tokens (anatomía de un run)
| Fase | ↓ entrada | Por qué |
|---|---|---|
| propose/spec/design/tasks | ~400-500k **cada una** | el one-shot re-explora el proyecto en CADA fase |
| apply | ~1.1M | legítimo: lee convenciones + spec + escribe código |
| verify (×3 lentes) | ~3×200k | paralelo barato; el merge es código |

**Diagnóstico central:** las fases derivadas (propose/clarify/design/tasks) NO necesitan releer el repo —
ya tienen los artefactos previos. Era el mayor desperdicio activo.

## 2. Palancas — estado tras esta consultoría
| Palanca | Ahorro est. | Estado |
|---|---|---|
| **No-rescan en fases derivadas** ("base it ONLY on prior artifacts — do NOT read project sources") | **-30/45% del input total del run** (la palanca nº1) | ✅ ACTIVADA HOY |
| MCPs fuera de los one-shots (github-mcp + conductor: ~2.5-3k tokens/tool/fase) | -10/30k por fase | ✅ activa |
| Tool-allowlist por rol (planner/reviewer solo `write`) | menos schemas + no vagabundeo por shell | ✅ activa |
| `.copilotignore` (builds/locks/logs fuera del contexto) | evita picos | ✅ activa (sdd-init) |
| Límites de output por fase (MAX words) + reports sintetizados por CÓDIGO | el output es lo más caro/u | ✅ activa |
| Sesión del usuario: `/sdd-run` = 1 mensaje y fuera (la app gestiona) | ~100% del coste de "niñera" | ✅ activa (v3) |
| Resume sin re-pagar + lock anti-dup + anti-relanzamiento | evita runs fantasma duplicados | ✅ activa |
| **Runner SDK** (sesiones calientes → prefijo cacheado entre fases; cache read ≈10% del precio) | -20/40% input adicional | 🔸 opt-in (`"runner":"sdk"`) — pasará a default tras 1 validación real |
| Lentes ×3 en verify | +2 llamadas baratas (reviewer) | ⚖️ coste consciente: con byok ≈$0; con catálogo, `"lenses": false` o 2 lentes |
| E2E/CI con agente fake | pruebas de producto a **0 tokens** | ✅ activa |

## 3. La economía en AIC (lo que le importa a Hiberus)
- Tu run GREEN (3.45M↓) con **qwen byok = $0 y 0 AIC**.
- El MISMO run todo-catálogo (p.ej. Haiku ≈$1/M↓): ≈ **$3.6 ≈ 360 AIC** → 6% de tus 6000 actuales…
  pero **19% de los 1900 que tendrás en septiembre**. 5 runs/día = inviable sin mezcla.
- **Receta recomendada por defecto** (la del conductor.json de prueba): planner+reviewer `byok:qwen` /
  coder `copilot:` solo si el proyecto lo exige → el run típico queda en **30-100 AIC** (solo el apply).

## 4. Próximas palancas (no activadas aún)
1. Confirmar con un run real el efecto del no-rescan (comparar ↓ de propose/spec antes/después). 
2. SDK default tras validación → cache de prefijo entre fases.
3. `explore` con presupuesto explícito ("read at most N files") para repos gigantes.
4. Telemetría de CACHÉ (cache-read tokens en OTel) para medir el descuento real del SDK.
