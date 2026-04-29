# Avanzado -- Optimización y troubleshooting

## Optimización de tokens

| Estrategia | Cómo funciona | Ahorro |
|---|---|---|
| **Spec-light** | Request >50 palabras con scope claro -> omite proposal | ~400 palabras |
| **Condensado** | 1 sola llamada al planner para todo el planning (medium) | Múltiples roundtrips |
| **Delegación directa** | Tareas de 1-2 archivos van directo al coder, sin pipeline | Pipeline completo |
| **Modo auto** | `execution_mode: auto` -> 0 pausas, 0 roundtrips extra | Interacciones usuario |
| **Instruction files compactos** | Mantener cada archivo <200 palabras | Tokens cargados por plataforma |
| **Specs en tablas** | Tablas sobre prosa: 600 vs 2000 palabras | Carga en fases downstream |

## Mejores prácticas

- Dejar que el orquestador orqueste -- no pedirle que lea código directamente; delega a sub-agentes.
- Usar `/sdd-new` como mínimo para cualquier feature que toque 3+ archivos.
- Batches pequeños en apply (2-3 tareas) -- fácil de rehacer si falla.
- Siempre verify antes de archive, sin excepciones.
- Configurar `post_hook` en config.yaml para capturar errores de build/type-check durante apply.
- Documentar gotchas en `openspec/lessons-learned.md` para sesiones futuras.
- Re-ejecutar `/sdd-init` + `/sdd-instructions` cuando el stack cambie.

## Anti-patrones

- Pedir al orquestador que edite archivos directamente -- infla su contexto sin beneficio.
- Archivar sin verify -- contamina la fuente de verdad en `openspec/specs/`.
- Re-ejecutar verify sin haber cambiado código -- gasto de tokens sin valor.
- Batches de 8-10 tareas en apply -- si falla, hay que rehacer todo el batch.
- Forzar SDD en tareas triviales -- el Complexity Gate existe para evitar esto.
- Editar `state.yaml` manualmente sin necesidad -- puede corromper el DAG.
- Instruction files con `applyTo: "**"` / `paths: "**"` -- carga tokens en TODOS los archivos.

## Troubleshooting

| Problema | Causa | Solución |
|---|---|---|
| Build falla tras apply exitoso | Apply no compila salvo que haya `post_hook` | Configurar `post_hook: "npm run build"` en config.yaml |
| Tests colgados durante verify | Test runner espera input interactivo o timeout insuficiente | Verificar que el comando en `x-conductor.hooks.verify.test_command` no requiera stdin |
| Instruction files no detectados | `/sdd-instructions` no ejecutado o plataforma no detectada | Ejecutar `/sdd-init` + `/sdd-instructions` |
| Agentes no escriben archivos | Sub-agente se quedó sin contexto por task list grande | Reducir tamaño de batches; el orquestador reintenta 1 vez automáticamente |
| `state.yaml` inconsistente | Compactación o error durante delegación | Eliminar state.yaml y re-ejecutar `/sdd-continue` (re-deriva estado desde artefactos) |
| `/sdd-continue` dice "No next phase" | Cambio ya archivado o state.yaml desactualizado | Verificar con `/sdd-status`; si necesario, eliminar state.yaml |
| Sub-agentes ignoran convenciones tras compactación | Instruction files se recargan por la plataforma, pero pueden faltar | Ejecutar `/sdd-instructions` para regenerar |
| Ecosistema con breaking changes | Modelo usa patrones de versiones antiguas | Configurar post_hook + documentar en lessons-learned.md + principios con versión específica |

---

Siguiente: [Conductor 101](./conductor-101.md) | [Quick Start](./quick-start.md) | [Pipeline SDD](./sdd-pipeline.md) | [OpenSpec](./openspec.md)
