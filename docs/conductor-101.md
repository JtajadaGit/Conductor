# Conductor 101 — Tus primeros 15 minutos

## ¿Qué problema resuelve?

Cuando pides a una IA que implemente un cambio complejo, suele generar código sin planificar, sin verificar y sin documentar. Conductor cambia eso:

**Sin Conductor**: prompt → código (sin plan, sin spec, sin tests, sin audit trail)
**Con Conductor**: prompt → spec → diseño → tareas → código → verificación → archivo

Esto es **Spec-Driven Development (SDD)**: escribir una especificación ANTES del código, para que el diseño sea testable y el resultado auditable.

## Los 3 agentes

| Agente | Rol | Analogía |
|--------|-----|----------|
| **sdd-planner** | Lee tu petición, explora el código, propone spec + diseño + tareas | El arquitecto |
| **sdd-coder** | Implementa las tareas, escribe tests, ejecuta hooks | El desarrollador |
| **sdd-reviewer** | Verifica que el código cumple la spec, ejecuta tests y build | El code reviewer |

El **orquestador** (tú + Conductor) coordina cuándo actúa cada agente.

## Glosario rápido

| Término | Significado |
|---------|-------------|
| **SDD** | Spec-Driven Development — especificación antes que código |
| **OpenSpec** | Estándar abierto para organizar specs en `openspec/` ([openspec.dev](https://openspec.dev/)) |
| **DAG** | Grafo de dependencias entre fases — cada fase necesita que la anterior termine |
| **Worktree** | Copia aislada del repo (Git) para que varios coders trabajen en paralelo sin conflictos |
| **Fast-forward** | Modo condensado (`/sdd-ff`) — toda la planificación en una sola llamada |
| **Spec-light** | Variante de fast-forward que omite proposal cuando el scope ya está claro (>50 palabras) |
| **Delta spec** | Spec parcial con secciones ADDED/MODIFIED/REMOVED — para cambios sobre specs existentes |
| **Artifact** | Fichero generado por el pipeline (proposal.md, spec.md, design.md, tasks.md) |
| **Phase gate** | Punto de control entre fases — bloquea si hay inconsistencias o preguntas sin resolver |
| **Execution mode** | `auto` (0 pausas) o `interactive` (pausa antes de apply/verify). Se configura en `config.yaml` |
| **Spec amendment** | Ajuste ligero a la spec descubierto durante apply — no requiere re-planear |

## Los 5 comandos esenciales

```
/sdd-init              # Setup inicial — detecta stack, crea openspec/
/sdd-new <nombre>      # Cambio grande o vago — pipeline completo
/sdd-ff <nombre>       # Cambio medio — planificación rápida (fast-forward)
/sdd-continue          # Continuar con la siguiente fase
/sdd-archive           # Archivar cambio verificado — promueve specs
```

## Ejemplo completo: "Añadir validación de email al formulario de registro"

```
TÚ: /sdd-ff validacion-email

ORQUESTADOR:
  → Lee config.yaml → execution_mode: auto
  → Spec-light: request claro → omite proposal

PLANNER (1 llamada, ~2 min):
  → spec:     Crea spec.md con escenarios GIVEN/WHEN/THEN
  → design:   Crea design.md con ficheros a modificar
  → tasks:    Crea tasks.md con 3 [P] source + 3 [S] tests

ORQUESTADOR:
  → Post-delegation validation: artefactos OK ✓
  → Modo auto → continúa sin pausa

CODER (~3 min):
  → Lee spec + tasks + design
  → Implementa en src/validation/email.ts
  → Escribe tests para cada escenario
  → Marca tareas [x] completadas

REVIEWER (~1 min):
  → Verifica: spec ↔ código alineado
  → Ejecuta: tests + build
  → Resultado: "PASS"

ORQUESTADOR:
  → "Cambio verificado. ¿Archivar con /sdd-archive?"

TÚ: /sdd-archive
  → Promueve delta specs a specs/ principal
  → Mueve cambio a archive/
  → ¡Listo!
```

## ¿Cuándo usar Conductor?

```
¿El cambio es vago o complejo (>3 ficheros)?
├─ SÍ → /sdd-new (pipeline completo con explore)
├─ NO, pero toca varios ficheros → /sdd-ff (planificación rápida)
└─ NO, ≤2 ficheros y claro → Delegación directa (sin SDD)
```

Conductor tiene un **Hard Stop Rule**: evalúa la complejidad de tu petición y te sugiere el modo adecuado. No fuerza SDD en tareas triviales.

## Siguiente paso

1. [Quick Start](./quick-start.md) — Instalación y primer uso
2. [Pipeline SDD](./sdd-pipeline.md) — Referencia detallada de cada fase
3. [OpenSpec](./openspec.md) — Estructura de ficheros y persistencia
4. [Avanzado](./advanced.md) — Optimización y troubleshooting

---

> **Referencias oficiales**: [Claude Code](https://docs.anthropic.com/en/docs/claude-code) · [GitHub Copilot](https://docs.github.com/en/copilot) · [OpenSpec](https://openspec.dev/) · [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)
