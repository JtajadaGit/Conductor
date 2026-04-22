# Quick Start -- Instalación y primer uso

## Requisitos

| Requisito | Descripción |
|---|---|
| **Plataforma IA** | GitHub Copilot CLI (principal) o Claude Code |
| **Git** | Repositorio git inicializado |
| **Proyecto existente** | Conductor se integra en proyectos con código existente |

## Instalación

Copia las carpetas `agents/` y `skills/` al directorio de tu plataforma:

| Plataforma | Agents | Skills |
|---|---|---|
| **Copilot CLI** | `.github/agents/` | `.github/skills/` |
| **Claude Code** | `.claude/agents/` | `.claude/skills/` |

## Plataformas soportadas

| Componente | Copilot CLI | Claude Code |
|---|---|---|
| **Skills** | `/sdd-init`, `/sdd-new`, etc. | Idénticos |
| **Agents** | `.github/agents/` + sub-agents | `.claude/agents/` + tool `Agent` |
| **Instruction files** | `.github/instructions/*.instructions.md` | `.claude/rules/*.md` |
| **Apply paralelo** | `/fleet` (context-window isolation) | `Agent` tool + `isolation: "worktree"` |
| **Model routing** | `model` frontmatter, `/model`, BYOK | `model` frontmatter, `/model`, env vars |

`/sdd-instructions` detecta la plataforma automáticamente y genera los instruction files en la ubicación correcta.

## Primer uso: 4 pasos

### Paso 1: Inicializar SDD

```
/sdd-init
```

Detecta stack tecnológico, testing framework, crea `openspec/config.yaml`. Resultado esperado:

```
SDD inicializado
  Stack: Node.js + TypeScript + Express
  Testing: Jest (detectado), strict_tdd: true
  Execution mode: interactive
  Persistencia: openspec (habilitado)
```

### Paso 2: Generar instruction files

```
/sdd-instructions
```

Escanea `.editorconfig`, `tsconfig.json`, `eslint.config.*`, etc. Genera instruction files de testing y formatting para la plataforma detectada.

### Paso 3: Configurar execution mode (opcional)

Edita `openspec/config.yaml`:

```yaml
x-conductor:
  execution_mode: auto    # auto (0 pausas) | interactive (pausa antes de apply/verify)
```

### Paso 4: Primer cambio

```
/sdd-new mi-feature
```

Evalúa complejidad automáticamente y elige el pipeline adecuado. Después:

```
/sdd-continue    # avanza a la siguiente fase
/sdd-archive     # cierra y promueve specs
```

## Verificación

- [ ] `/sdd-init` responde con detección de stack
- [ ] `openspec/config.yaml` existe con datos del proyecto
- [ ] `/sdd-instructions` genera instruction files en la ubicación de la plataforma
- [ ] `/sdd-new test` genera artefactos en `openspec/changes/`
- [ ] El orquestador delega a sub-agentes (no ejecuta código inline)

## Troubleshooting

| Problema | Solución |
|---|---|
| `/sdd-init` no reconocido | Skills no copiados a la ubicación correcta de la plataforma. Verifica la estructura de directorios |
| Orquestador ejecuta código directamente | Skills no cargados. Verifica que están en el directorio correcto de la plataforma |
| No se crean artefactos en `openspec/` | `/sdd-init` no fue ejecutado. Ejecutar primero |
| Sub-agentes ignoran convenciones | Instruction files no generados. Ejecuta `/sdd-instructions` |
| Instruction files en ubicación incorrecta | `/sdd-instructions` no detectó la plataforma. Verifica que `.github/` o `.claude/` existen en el proyecto |

---

Siguiente: [Conductor 101](./conductor-101.md) | [Pipeline SDD](./sdd-pipeline.md) | [OpenSpec](./openspec.md) | [Avanzado](./advanced.md)
