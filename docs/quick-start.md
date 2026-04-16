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

### Claude Code (CLI)

```bash
/plugin add <ruta-a-Conductor>
/reload-plugins
```

Verifica: `/plugin` debe mostrar "conductor" instalado. Skills y agentes se cargan directamente desde el plugin — no se copian archivos al proyecto.

### GitHub Copilot (VS Code / CLI)

```bash
# Desde la raíz de tu proyecto
cp -r Conductor/plugins/conductor/agents/  .github/agents/
cp -r Conductor/plugins/conductor/skills/  .github/skills/
```

Los agents y skills se copian a `.github/` — Copilot los descubre automáticamente.

### Qué se registra

| Componente | Claude Code | Copilot |
|---|---|---|
| **Skills** | `/sdd-init`, `/sdd-ff`, `/instructions`, etc. | Mismos, desde `.github/skills/` |
| **Agents** | `sdd-planner`, `sdd-coder`, `sdd-reviewer` | Mismos, desde `.github/agents/` |
| **Instruction files** | `.claude/rules/*.md` | `.github/instructions/*.instructions.md` |
| **Pipeline artifacts** | `openspec/` (compartido) | `openspec/` (compartido) |

### Comparativa de capacidades

| Feature | Claude Code | Copilot VS Code | Copilot CLI |
|---------|-------------|-----------------|-------------|
| Instalación | `/plugin add` (nativo) | Copiar a `.github/` | Copiar a `.github/` |
| Sub-agents | `Agent` tool (completo) | Copilot Chat agents | Agentic mode |
| Parallel apply (worktrees) | ✅ `isolation: "worktree"` | ❌ Secuencial | ✅ Sub-processes |
| Model routing por fase | ✅ opus/sonnet/haiku | Modelo único | Configurable |
| Instruction files auto-load | ✅ `.claude/rules/` | ✅ `.github/instructions/` | ✅ `.github/instructions/` |
| `openspec/` compartido | ✅ | ✅ | ✅ |
| No sobrescribe instrucciones | ✅ (`CLAUDE.md` intacto) | ✅ (`copilot-instructions.md` intacto) | ✅ |

---

## Primer uso: paso a paso

### Paso 1: `/sdd-init`

```
/sdd-init
```

Detecta stack, testing, crea `openspec/config.yaml` (pipeline config).

Resultado esperado:
```
✅ SDD inicializado
   Stack: Node.js + TypeScript + Express
   Testing: Jest (detectado), strict_tdd: true
   Execution mode: interactive (cambiar en config.yaml)
   Persistencia: openspec (habilitado)
   → Ejecuta /instructions para generar instruction files de testing y formatting
```

### Paso 2: `/instructions`

```
/instructions
```

Escanea `.editorconfig`, `tsconfig.json`, `eslint.config.*`, etc. y genera instruction files (`testing`, `formatting`, `project-config`) en ambas plataformas.

### Paso 3 (opcional): Configurar execution mode

Edita `openspec/config.yaml`:
```yaml
x-conductor:
  execution_mode: auto    # auto (0 pausas) | interactive (pausa antes de apply/verify)
```

### Paso 4: Primer cambio

```
/sdd-ff mi-feature       # Cambio medio — pipeline condensado
/sdd-new mi-feature      # Cambio grande o vago — pipeline completo
```

Desde ahí:
```
/sdd-continue    # avanzar a la siguiente fase pendiente (apply, verify, etc.)
/sdd-archive     # cerrar y promover specs a main
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
| `/sdd-init` no reconocido | Plugin no instalado | `/plugin add <ruta>` y `/reload-plugins` |
| Orquestador ejecuta código directamente | Skills no cargados | `/reload-plugins` para recargar |
| No se crean artefactos | `/sdd-init` no ejecutado | Ejecutar `/sdd-init` |
| Sub-agentes ignoran convenciones | Conventions no generado | Ejecutar `/instructions` |

---

### Referencias oficiales
- **Claude Code**: https://docs.anthropic.com/en/docs/claude-code
- **GitHub Copilot**: https://docs.github.com/en/copilot
- **OpenSpec estándar**: https://openspec.dev/
- **RFC 2119** (keywords): https://www.rfc-editor.org/rfc/rfc2119

---

→ [Conductor 101](./conductor-101.md) | [Pipeline SDD completo](./sdd-pipeline.md) | [OpenSpec y persistencia](./openspec.md)
