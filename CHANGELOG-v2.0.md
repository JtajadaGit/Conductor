# Changelog — Conductor v2.0

## Breaking Changes

### Arquitectura: 13 skills → 3 agentes
- **Eliminados**: `sdd-explore`, `sdd-propose`, `sdd-clarify`, `sdd-spec`, `sdd-design`, `sdd-tasks`, `sdd-apply`, `sdd-verify`, `sdd-fix` (como skills individuales)
- **Reemplazados por**: 3 agentes (`sdd-planner`, `sdd-coder`, `sdd-reviewer`) que absorben todas las fases
- Cada agente es un archivo AGENT.md que contiene todas sus fases

### Shared files: 6 → 2
- **Eliminados**: `skills/_shared/sdd-phase-common.md`, `persistence-contract.md`, `openspec-convention.md`, `sdd-protocol.md`, `skill-resolver.md`, `orchestrator-reference.md`
- **Reemplazados por**: `agents/_shared/sdd-protocol.md` (unificado, absorbe skill-resolver), `agents/_shared/orchestrator-reference.md` (on-demand)

### Pipeline SDD: spec-first obligatorio
- spec||design paralelo ya NO está permitido
- spec SIEMPRE se ejecuta antes de design
- design DEBE recibir specs como input requerido

### Rutas cambiadas
- `skills/sdd-*/SKILL.md` → `agents/sdd-*/AGENT.md` (para fases SDD)
- `skills/_shared/*` → `agents/_shared/*`
- Skills invocables permanecen en `skills/`

## Nuevas funcionalidades

### Lessons Learned system
- `openspec/lessons-learned.md`: archivo append-only con insights de debugging
- sdd-coder lee antes de implementar (evita errores conocidos)
- sdd-coder appenda tras cada fix exitoso

### Execution Log
- `openspec/changes/{name}/execution-log.md`: registro de cada fase ejecutada
- Timestamp, fase, status, duración, notas

### Hooks mejorados
- `checkpoint_every: N` — ejecutar post_hook cada N tasks
- Documentación de ejemplos comunes

### Verify fast-path explícito
- Sin test infrastructure → verdict: "PASS (static only — no behavioral validation)"
- NO reportar PASS ambiguo sin tests

### Smart task grouping
- Tareas repetitivas con mismo patrón → 1 sola tarea con lista
- Ejemplo: NO 5 tareas para 5 mocks → 1 tarea "crear los 5 mocks"

### Explore condicional mejorado
- Input >100w con scope claro → skip explore
- Input <30w o vago → execute explore
- Heurística + opción de preguntar al usuario

### Project Principles
- `openspec/principles.md`: max 5 principios, human-authored, inmutable
- Inyectados en cada delegación como `## Project Principles`

## Consolidación de documentación

### Docs: 19 → 5 (83% reducción)
- **Eliminados**: 14 docs con contenido redundante o duplicado de SKILL.md/AGENT.md
- **Mantenidos/nuevos**: `quick-start.md`, `sdd-pipeline.md`, `openspec.md`, `advanced.md`, `18-migracion-v1-v2.md`
- **Eliminado**: `skill-creator/SKILL.md` (no era necesario)
- **Eliminado**: `agents/_shared/skill-resolver.md` (absorbido en sdd-protocol.md)
- **Añadido**: SYNC-PAIR markers en orchestrators para evitar drift entre plataformas

## Métricas

| Métrica | v1.2 | v2.0 |
|---------|------|------|
| Archivos de fase SDD | 13 | 3 |
| Líneas orquestador | 144 | ~80 |
| Archivos _shared/ | 6 (~440L) | 2 (~180L) |
| Líneas SKILL.md (fases) | ~1,628 | 0 (migrado a AGENT.md) |
| Líneas AGENT.md totales | 0 | ~320 |
| Lecturas _shared/ por delegación | 3 | 1 |
