# Quick Start — Conductor

Conductor funcionando en tu proyecto en menos de 5 minutos.

---

## Requisitos

| Requisito | Descripción |
|-----------|-------------|
| **Plataforma IA** | Claude Code (Anthropic) **o** GitHub Copilot (VS Code / CLI) |
| **Git** | Repositorio git inicializado |
| **Proyecto existente** | Conductor se integra en proyectos existentes |

---

## Instalación

### Paso 1: Obtener Conductor

```bash
git clone https://github.com/tu-org/Conductor.git
# o descargar el ZIP desde GitHub
```

### Paso 2: Copiar a tu proyecto

#### Claude Code

```bash
# Linux/Mac
cp Conductor/instructions/CLAUDE.md tu-proyecto/.claude/CLAUDE.md
cp -r Conductor/agents/ tu-proyecto/.claude/agents/
cp -r Conductor/skills/ tu-proyecto/.claude/skills/
```

```powershell
# Windows PowerShell
Copy-Item Conductor\instructions\CLAUDE.md tu-proyecto\.claude\CLAUDE.md
Copy-Item -Recurse Conductor\agents\ tu-proyecto\.claude\agents\
Copy-Item -Recurse Conductor\skills\ tu-proyecto\.claude\skills\
```

#### GitHub Copilot (VS Code / CLI)

```bash
# Linux/Mac
cp Conductor/instructions/copilot-instructions.md tu-proyecto/.github/copilot-instructions.md
cp -r Conductor/agents/ tu-proyecto/.github/agents/
cp -r Conductor/skills/ tu-proyecto/.github/skills/
```

```powershell
# Windows PowerShell
Copy-Item Conductor\instructions\copilot-instructions.md tu-proyecto\.github\copilot-instructions.md
Copy-Item -Recurse Conductor\agents\ tu-proyecto\.github\agents\
Copy-Item -Recurse Conductor\skills\ tu-proyecto\.github\skills\
```

#### Ambas plataformas (dual)

Combina los dos bloques anteriores. `openspec/` es compartido — cualquier plataforma lee y escribe los mismos artefactos.

### Paso 3: Estructura resultante

```
tu-proyecto/
├── .claude/                         ← Claude Code
│   ├── CLAUDE.md                   ← Orquestador
│   ├── agents/
│   │   ├── _shared/
│   │   ├── sdd-planner/AGENT.md
│   │   ├── sdd-coder/AGENT.md
│   │   └── sdd-reviewer/AGENT.md
│   └── skills/
│       ├── sdd-init/
│       ├── sdd-new/
│       ├── sdd-ff/
│       ├── sdd-continue/
│       ├── sdd-status/
│       ├── sdd-archive/
│       └── conventions/
├── .github/                         ← GitHub Copilot (si dual)
│   ├── copilot-instructions.md
│   ├── agents/
│   └── skills/
├── .github/
│   └── instructions/
│       ├── context.instructions.md      ← Contexto del repo (generado por /sdd-init)
│       └── conventions.instructions.md  ← Convenciones del equipo (generado por /conventions)
└── openspec/                        ← Artefactos SDD (creados por /sdd-init)
```

---

## Diferencias por plataforma

| Característica | Claude Code | Copilot VS Code | Copilot CLI |
|---------------|-------------|-----------------|-------------|
| Orquestador | `.claude/CLAUDE.md` | `.github/copilot-instructions.md` | `.github/copilot-instructions.md` |
| Agentes | `.claude/agents/` | `.github/agents/` | `.github/agents/` |
| Skills | `.claude/skills/` | `.github/skills/` | `.github/skills/` |
| Modelos | high-capability / standard / fast | high-capability / standard / fast | high-capability / standard / fast |
| Tool use | ✅ Completo | ✅ Completo | ✅ Completo (agentic) |
| Slash commands | ✅ `/sdd-init` | ✅ `/sdd-init` | ✅ `/sdd-init` |

---

## Primer uso: `/sdd-init`

El primer comando en cualquier proyecto nuevo:

```
/sdd-init
```

¿Qué hace?
1. Detecta stack tecnológico (Node.js, Python, Go, Rust, .NET...)
2. Detecta framework de testing y configura `strict_tdd`
3. Crea estructura `openspec/` (si confirmas persistencia)
4. Genera `openspec/conventions.md` con convenciones del equipo (si hay custom skills)

Resultado esperado:
```
✅ SDD inicializado
   Stack: Node.js + TypeScript + Express
   Testing: Jest (detectado), strict_tdd: true
   Persistencia: openspec (habilitado)
   Conventions: generado
```

---

## Primer cambio: `/sdd-new` o `/sdd-ff`

```
/sdd-new autenticacion-jwt
```
→ Evalúa input → explore (si necesario) → propose → clarify gate

```
/sdd-ff autenticacion-jwt
```
→ propose → clarify → spec → design → tasks (plan completo)

Desde ahí:
```
/sdd-continue    # avanzar fase a fase
/sdd-apply       # implementar
/sdd-verify      # verificar
/sdd-archive     # cerrar
```

---

## Verificación rápida

- [ ] `/sdd-init` responde con detección de stack
- [ ] `/sdd-new test` genera exploración + propuesta
- [ ] El orquestador delega a sub-agentes (no ejecuta código inline)
- [ ] Se crean artefactos en `openspec/changes/` (modo openspec)

### Síntomas de problema

| Síntoma | Causa | Solución |
|---------|-------|----------|
| `/sdd-init` no reconocido | Skills no copiados al path correcto | Verificar `.claude/skills/` o `.github/skills/` |
| Orquestador ejecuta código directamente | Instrucciones no cargadas | Verificar `.claude/CLAUDE.md` o `copilot-instructions.md` |
| No se crean artefactos | Modo `none` activo | Habilitar openspec: "activa openspec" |
| Sub-agentes ignoran convenciones | Conventions no generado | Ejecutar `/conventions` |

---

→ [Pipeline SDD completo](./sdd-pipeline.md) | [OpenSpec y persistencia](./openspec.md)
