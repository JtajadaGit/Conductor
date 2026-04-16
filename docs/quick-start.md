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

### Claude Code

```bash
# Desde Claude Code en tu proyecto
/plugin add <ruta-a-Conductor>
```

Conductor se registra como plugin. No copia archivos ni sobrescribe `CLAUDE.md`. Los skills y agentes se cargan directamente desde el plugin.

Verifica la instalación:
```bash
/plugin           # Debe mostrar "conductor" instalado
/reload-plugins   # Recarga si acabas de instalar
```

### GitHub Copilot

> Pendiente: integración nativa via plugin. Por ahora, copiar manualmente `plugins/conductor/agents/` y `plugins/conductor/skills/` a `.github/`.

### Qué se registra

El plugin expone:
- **7 skills** como `/sdd-init`, `/sdd-ff`, etc.
- **3 agentes** (`sdd-planner`, `sdd-coder`, `sdd-reviewer`) + shared protocols
- **0 archivos modificados** en tu proyecto (hasta que ejecutes `/sdd-init`)

---

## Diferencias por plataforma

| Característica | Claude Code | Copilot VS Code | Copilot CLI |
|---------------|-------------|-----------------|-------------|
| Instalación | `/plugin add` (nativo) | Manual (copiar a `.github/`) | Manual (copiar a `.github/`) |
| Orquestador | Skills del plugin (no sobrescribe `CLAUDE.md`) | `.github/copilot-instructions.md` | `.github/copilot-instructions.md` |
| Agentes | Plugin agents (auto-descubiertos) | `.github/agents/` | `.github/agents/` |
| Skills | `/sdd-*` | `/sdd-*` | `/sdd-*` |
| Modelos | high-capability / standard / fast | high-capability / standard / fast | high-capability / standard / fast |
| Tool use | ✅ Completo | ✅ Completo | ✅ Completo (agentic) |

---

## Primer uso: paso a paso

### Paso 1: `/sdd-init`

```
/sdd-init
```

Detecta stack, testing, crea `openspec/` con `config.yaml` y `context.md`.

Resultado esperado:
```
✅ SDD inicializado
   Stack: Node.js + TypeScript + Express
   Testing: Jest (detectado), strict_tdd: true
   Execution mode: interactive (cambiar en config.yaml)
   Persistencia: openspec (habilitado)
   → Ejecuta /conventions para completar Team Standards
```

### Paso 2: `/conventions`

```
/conventions
```

Escanea `.editorconfig`, `tsconfig.json`, `eslint.config.*`, etc. y puebla la sección `## Team Standards` de `openspec/context.md`.

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
| Sub-agentes ignoran convenciones | Conventions no generado | Ejecutar `/conventions` |

---

### Referencias oficiales
- **Claude Code**: https://docs.anthropic.com/en/docs/claude-code
- **GitHub Copilot**: https://docs.github.com/en/copilot
- **OpenSpec estándar**: https://openspec.dev/
- **RFC 2119** (keywords): https://www.rfc-editor.org/rfc/rfc2119

---

→ [Conductor 101](./conductor-101.md) | [Pipeline SDD completo](./sdd-pipeline.md) | [OpenSpec y persistencia](./openspec.md)
