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

## Plataformas soportadas

Conductor funciona como plugin en las 3 plataformas. Ver [README § Plataformas](../README.md#plataformas) para la comparativa completa.

| Componente | Claude Code | Copilot CLI | Copilot VS Code |
|---|---|---|---|
| **Plugin system** | `/plugin add` | `/plugin install` | Copiar a `.github/` |
| **Skills** | `/sdd-init`, `/sdd-new`, etc. | `/sdd-init`, `/sdd-new`, etc. | Mismos, desde `.github/skills/` |
| **Agents** | Plugin agents (`Agent` tool) | `.github/agents/` + sub-agents | `.github/agents/` via Chat |
| **Instruction files** | `.claude/rules/*.md` | `.github/instructions/*.instructions.md` | `.github/instructions/*.instructions.md` |
| **Parallel apply** | ✅ worktrees | ✅ `/fleet` + worktrees | Delega a Copilot CLI |
| **Model routing** | Per delegación | `--model` flag / BYOK | Copilot settings |

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
/sdd-new mi-feature      # Evalúa complejidad → elige pipeline automáticamente
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
