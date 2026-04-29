# Conductor — Plan de mejoras

Última actualización: 2026-04-29
Base: commit c3718c1 + surgical fixes (tool aliases, guard-tools security, inject-context instructions, spec-exact coder rule)
Fuentes: Copilot CLI docs, VS Code docs, GitHub customization cheat sheet, OpenSpec v1.3.1, Gentle-AI v1.24.1, awesome-copilot (RUG, GEM), 5 tests reales con reportes

---

## Estado actual confirmado (5 tests)

| Plataforma | Funciona | Detalles |
|-----------|----------|----------|
| **Copilot CLI** | SÍ | Subagents reales (task sync). Pipeline completa: plan → apply → FAIL → fix → verify → PASS. Instructions cargadas. I/O bridge activo. Review loop funcional. |
| **VS Code** | PARCIAL | Ejecuta pipeline inline (sin subagents aislados). Crea artifacts OpenSpec correctos. Instructions cargadas. Spec paths correctos. Pero no delega a subagents — hace todo en foreground. |

### Lo que funciona en AMBAS plataformas
- Skills se cargan y se ejecutan (`/sdd-new`)
- Instruction files (`.github/instructions/`) se leen y influyen en el código
- OpenSpec artifacts se crean en paths correctos (`specs/{domain}/spec.md`)
- Pipeline completa se ejecuta (plan → apply → verify)
- Config.yaml se lee correctamente
- Agent files definen roles y restricciones

### Lo que solo funciona en CLI
- Subagents aislados (background o sync) via tool `agent`/`task`
- `allowed-tools: ['agent']` en skills (VS Code ignora este campo)
- Hooks (inject-state, inject-context, guard-tools) — VS Code hooks en preview

### Lo que no funciona en ninguna
- `delegate` (async background) no se usa consistentemente — el modelo elige `task` (sync)
- Planner no siempre lee instruction files antes de generar artifacts

---

## Urgentes aplicados (2026-04-28)

| # | Estado | Qué se hizo |
|---|--------|-------------|
| U1 | ✅ APLICADO | Prompt file (`.github/prompts/sdd-new.prompt.md`) investigado. Resultado: prompt files funcionan en VS Code pero NO en CLI. Skill con `allowed-tools: ['agent']` funciona en CLI pero VS Code ignora el campo. **Decisión pendiente**: crear prompt file como complemento del skill para VS Code. |
| U2 | ✅ APLICADO | sdd-coder.agent.md reforzado: "If spec says `/api/productos`, use `/api/productos` — NOT `/api/products`. Copy spec values literally." |
| U3 | ✅ APLICADO | inject-context.sh/.ps1 ahora inyecta paths de instruction files: `[INSTRUCTIONS] Read these before coding: .github/instructions/...` |
| U4 | ✅ APLICADO | conductor.json paths apuntan a `.github/hooks/` (destino en proyecto integrador). |

### Urgente adicional aplicado
| # | Estado | Qué se hizo |
|---|--------|-------------|
| U5 | ✅ APLICADO | Git bloqueado en TRES niveles: (1) guard-tools.sh bloquea `git *`, curl, wget, web_fetch, rm -rf. (2) Los 3 agents tienen "NEVER run git commands" en sus rules. (3) sdd-new skill tiene "NEVER run git commands". |

---

## Pendiente: Entry point VS Code

### Problema
- Skills en VS Code NO tienen acceso a `runSubagent` (confirmado por docs)
- `allowed-tools` ignorado por VS Code
- Prompt files funcionan en VS Code pero NO en CLI
- Agent files funcionan en ambos pero añadir un conductor agent confunde

### Solución propuesta: dual entry point
```
.github/skills/sdd-new/SKILL.md          ← Entry point CLI (/sdd-new)
.github/prompts/sdd-new.prompt.md         ← Entry point VS Code (/sdd-new)
```
Mismo contenido, dos formatos. Cada plataforma carga el que entiende. El usuario hace `/sdd-new` en ambas.

### Soporte por plataforma (GitHub Customization Cheat Sheet)

| Feature | VS Code | CLI | GitHub.com |
|---------|---------|-----|------------|
| Custom instructions | ✓ | ✓ | ✓ |
| Prompt files | ✓ | ✗ | ✗ |
| Custom agents | ✓ | ✓ | ✓ |
| Skills | ✓ | ✓ | ✓ |
| Hooks | preview | ✓ | ✓ |
| MCP | ✓ | ✓ | ✓ |

### Regla: NUNCA usar copilot-instructions.md
Todo vive en `.github/` — agents, skills, prompts, hooks, instructions. Nada en raíz.

---

## ALTA — Pendientes de implementar

### A1. Prompt file para VS Code
**Estado**: Investigado. Pendiente crear.
**Acción**: Crear `.github/prompts/sdd-new.prompt.md` con `tools: ['agent']`. Mismo contenido que el skill. VS Code lo carga como `/sdd-new` con acceso a runSubagent.

### A2. subagentStop hook para verificar artifacts
**Fuente**: CLI docs — `subagentStop` puede ejecutar post-verificación.
**Acción**: Crear hook que verifique artifacts esperados tras cada subagent.

### A3. Model routing por fase
**Fuente**: Gentle-AI v1.23 — per-phase model assignment.
**Estado**: Ya tenemos `model` en agents (opus/sonnet/haiku). Verificar que se respeta en subagents.

### A4. Spec linter pre-apply
**Acción**: Hook preToolUse que valide spec.md no contiene framework terms antes de que el coder lo lea.

### A5. Planner no lee instruction files
**Evidencia**: CLI reporte — "sdd-planner initially reported no .github/instructions files" y "suggested React/TSX patterns while the repo uses Angular."
**Acción**: Reforzar en sdd-planner.agent.md que lea instruction files para entender el stack. O inyectar stack info via subagentStart hook.

---

## MEDIA — Robustez

### M1. State.yaml schema incompleto
**Evidencia**: Planner genera 11 líneas vs 20 campos esperados.
**Acción**: Reforzar schema mínimo en planner.

### M2. Apply-report merge en fix cycles
**Evidencia**: Test 1 creó `apply-fix-report.md` separado.
**Acción**: Reforzar "Append to EXISTING apply-report.md — NEVER create separate file."

### M3. Limpiar changes/ entre tests
**Evidencia**: Artifacts de tests previos interfieren (ReactiveFormsModule, ContactoComponent).
**Acción**: Documentar limpieza. Posible skill `/sdd-clean`.

### M4. mocks/ fuera de src/
**Evidencia**: `mocks/fake-product-api.ts` en raíz.
**Acción**: Reforzar "Write ALL code to src/. NEVER create directories at project root."

### M5. Proposal.md inconsistente
**Evidencia**: A veces se genera, a veces no. Depende del modelo.
**Acción**: Reforzar en planner. Considerar hacerlo opcional oficialmente (OpenSpec lo permite).

### M6. Design.md inconsistente para large
**Evidencia**: No siempre se genera en complexity large.
**Acción**: Reforzar "For LARGE: ALL artifacts required."

### M7. README.apply-checklist.md y sample-data.json inesperados
**Evidencia**: CLI reporte muestra archivos no planificados en openspec/changes/.
**Acción**: Reforzar que el planner solo produce los artifacts definidos en el schema.

---

## BAJA — Calidad de vida

| # | Descripción | Estado |
|---|-------------|--------|
| B1 | .copilotignore template en sdd-init | ✅ Implementado |
| B2 | openspec.gitignore en sdd-init | Creado, pendiente integrar |
| B3 | JSON estructurado en hooks | Descartado — formato actual más legible para LLM |
| B4 | Cross-artifact validator | Pendiente |
| B5 | Guard-tools logging | Pendiente |
| B6 | sdd-status mejorado (DAG visual) | Pendiente |
| B7 | /sdd-ff fast-forward (como OpenSpec) | Pendiente |
| B8 | Bulk archive | Pendiente |

---

## Arquitectura actual del proyecto integrador

```
.github/
├── agents/                         ← 3 agents especializados
│   ├── sdd-planner.agent.md          model: opus, tools: [read, search, edit]
│   ├── sdd-coder.agent.md            model: sonnet, tools: [read, search, edit, execute]
│   └── sdd-reviewer.agent.md         model: haiku, tools: [read, search, execute]
│
├── skills/                         ← 6 skills (entry points + utilities)
│   ├── sdd-new/SKILL.md              Orchestrator — allowed-tools: ['agent']
│   ├── sdd-continue/SKILL.md         Resume pipeline
│   ├── sdd-init/SKILL.md             Bootstrap openspec/
│   ├── sdd-instructions/SKILL.md     Generate instruction files
│   ├── sdd-archive/SKILL.md          Archive completed change
│   └── sdd-status/SKILL.md           Show progress
│
├── prompts/                        ← PENDIENTE: VS Code entry point
│   └── sdd-new.prompt.md             tools: ['agent'] — VS Code subagent support
│
├── hooks/                          ← 3 hooks deterministas
│   ├── conductor.json                 sessionStart + subagentStart + preToolUse
│   ├── inject-state.sh/.ps1           Inyecta estado activo
│   ├── inject-context.sh/.ps1         Inyecta contexto + instruction paths a subagents
│   └── guard-tools.sh/.ps1            Bloquea git, curl, wget, rm -rf, web_fetch
│
└── instructions/                   ← Generados por /sdd-instructions
    ├── framework.instructions.md
    ├── testing.instructions.md
    ├── formatting.instructions.md
    └── styling.instructions.md

openspec/
├── config.yaml                     ← Pipeline config (auto_mode, strict_tdd, hooks, stack)
├── specs/                          ← Main specs (promoted from changes)
└── changes/
    ├── {change-name}/              ← Active change
    │   ├── proposal.md
    │   ├── specs/{domain}/spec.md
    │   ├── design.md (optional)
    │   ├── tasks.md (optional)
    │   ├── state.yaml
    │   ├── apply-report.md
    │   └── verify-report.md
    └── archive/                    ← Completed changes
```

---

## Datos de referencia

### Tests realizados (5 total)

| # | Plataforma | Resultado | Subagents | Review loop | Instructions | Key finding |
|---|-----------|-----------|-----------|-------------|-------------|-------------|
| 1 | CLI | PASS | Background reales | 1 fix cycle | No cargadas | Primera pipeline completa |
| 2 | VS Code | Narrado | Ninguno | No | No | Skills no invocan subagents |
| 3 | CLI | PASS | Background reales | 1 fix cycle | Cargadas (coder) | Planner sugirió React en proyecto Angular |
| 4 | VS Code | Inline | Simulados | No | Cargadas | Gentle-AI MCP interceptó |
| 5 | CLI+VSC | PASS / Parcial | Sync reales / Inline | 2 ciclos / 0 | Cargadas ambas | VS Code creó artifacts OpenSpec correctos |

### Fuentes oficiales consultadas
- https://docs.github.com/en/copilot/reference/customization-cheat-sheet
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
- https://docs.github.com/en/copilot/reference/custom-agents-configuration
- https://code.visualstudio.com/docs/copilot/customization/custom-agents
- https://code.visualstudio.com/docs/copilot/agents/subagents
- https://code.visualstudio.com/docs/copilot/customization/agent-skills
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills
- https://github.com/Fission-AI/OpenSpec/ (v1.3.1)
- https://github.com/Gentleman-Programming/gentle-ai (v1.24.1)
- https://github.com/github/awesome-copilot (RUG, GEM orchestrators)
