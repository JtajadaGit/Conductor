# Conductor v1.1 — Mejoras post-análisis comparativo

Análisis comparativo con **Spec Kit** y **Ariadne** reveló 7 mejoras que aumentan la fiabilidad de Conductor sin sacrificar su ligereza. Coste total: ~1 request extra + ~150 tokens por ciclo.

## Qué se hizo y por qué

### P1 — Alto impacto, coste mínimo

**1. Fase `sdd-clarify`** — Conductor pasaba de propose directo a spec/design. Si la propuesta tenía ambigüedades, estas se propagaban y corregirlas costaba 3-8 requests de re-work. Ahora hay un gate automático que detecta gaps y presenta preguntas con opciones (A/B/C). Si no hay preguntas, auto-skip a coste cero.

**2. Consistency check en `sdd-tasks`** — Las tareas se generaban sin validar que cubrieran todos los requisitos del spec ni siguieran las decisiones del design. Ahora sdd-tasks cruza spec ↔ design ↔ tasks antes de persistir. Si detecta un gap crítico, bloquea apply. Coste: 0 requests (inline).

### P2 — Impacto medio, coste casi nulo

**3. `openspec/principles.md`** — Conductor delegaba governance a las skills, pero las skills son técnicas (cómo hacer), no de principios (qué priorizar). Ahora soporta un fichero opcional de máx. 5 principios NON-NEGOTIABLE que se inyectan en cada sub-agente (~30-50 tokens). Inspirado en la "constitución" de Spec Kit y las capas de autoridad de Ariadne.

**4. `requires_human_input` en envelope** — El orchestrator lanzaba spec/design sin saber si la propuesta tenía suposiciones no verificables desde código. Ahora los sub-agentes pueden señalar que necesitan contexto humano, y el orchestrator pausa automáticamente.

**5. Error Recovery Protocol** — Conductor no documentaba qué hacer cuando un sub-agente fallaba. Ahora hay un protocolo estandarizado: PAUSE → DISPLAY → OPTIONS para cada tipo de error (blocked, partial, timeout, compactación). El orchestrator nunca toma decisiones de recuperación solo — presenta opciones.

### P3 — Bajo impacto, mejora incremental

**6. Artifact locks en `state.yaml`** — Ariadne tiene contratos inmutables (potente pero ceremonioso). Conductor ahora congela spec/design cuando tasks se completa. Si el usuario quiere modificarlos después, se advierte y se regeneran las tareas. Misma protección, sin fase extra.

**7. Hooks recomendados para Claude Code** — Documentación de hooks útiles: mostrar estado SDD activo al hacer commit, auto-approve de operaciones sobre ficheros SDD.

## DAG actualizado

```
explore → propose → clarify → spec ──┐
                       │              ├──→ tasks → apply → verify → archive
                       └──→ design ───┘
```

## Origen de cada mejora

| Mejora | Inspirada en | Adaptación para Conductor |
|--------|-------------|--------------------------|
| clarify | Ariadne (open_questions.md loop) + Spec Kit (/speckit.clarify) | Fase ligera con auto-skip, no loop obligatorio |
| consistency check | Spec Kit (/speckit.analyze) | Inline en tasks, no fase separada |
| principles.md | Spec Kit (constitution.md) + Ariadne (7-layer authority) | Máx 5 líneas, ~50 tokens, opcional |
| requires_human_input | Ariadne (HUMAN PAUSE steps) | Campo en envelope, no paso forzado |
| error recovery | Ariadne (PAUSE → OPTIONS → LOG) | Tabla de comportamiento por tipo de error |
| artifact locks | Ariadne (immutable contract_spec.md) | Flag en state.yaml, no fase separada |
| hooks | Claude Code best practices | Solo documentación, no obligatorio |
