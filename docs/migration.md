# Migración al plugin de Conductor

Si ya tenías Conductor configurado con los archivos copiados en `.github/` de tu proyecto, sigue estos pasos para migrar a la nueva versión basada en plugin de Copilot.

## Por qué el cambio

En la versión anterior, las instrucciones de orquestación vivían en `.github/copilot-instructions.md`. Esto hacía que Conductor estuviera **siempre activo**: cada conversación con Copilot cargaba el contexto de orquestación y los agentes SDD, incluso cuando no los necesitabas. Consumía tokens y añadía latencia innecesaria en tareas que no requerían el pipeline.

Ahora Conductor es un **plugin opcional**. Solo se activa cuando seleccionas el agente `sdd-orchestrator` o invocas un skill `/sdd-*`. El resto del tiempo, Copilot funciona con normalidad sin cargar contexto adicional.

## Qué cambia

| Antes | Ahora |
|---|---|
| Archivos copiados en `.github/agents/`, `.github/skills/` | Plugin instalado via Copilot — sin archivos locales |
| Orquestación en `.github/copilot-instructions.md` (siempre activa) | Plugin opcional — solo se carga al usar `sdd-orchestrator` |
| `openspec/config.yaml` con formato anterior | Nuevo formato de `config.yaml` generado por `/sdd-init` |
| Skill `/sdd-new` como entry point | Agente `sdd-orchestrator` como entry point |
| Sin skill de instructions | Nuevo skill `/sdd-instructions` genera convenciones del stack |

## 1. Guardar configuración personalizada

Antes de borrar nada, revisa si tienes configuración personalizada en `openspec/config.yaml` (comandos de test, build, linting, variables de entorno, rutas de arquitectura, etc.). Si es así, guarda una copia — podrás aplicar esas personalizaciones sobre el nuevo `config.yaml` que generará `/sdd-init`.

## 2. Borrar archivos anteriores

Elimina todo lo relacionado con la versión anterior de Conductor en tu proyecto:

- `.github/copilot-instructions.md`
- `.github/agents/`
- `.github/skills/`
- `openspec/`

A partir de ahora Conductor funciona como plugin de Copilot — los agentes, skills y hooks se cargan directamente desde el plugin, no necesitarás estos archivos en local.

> **Nota:** no borres `.github/instructions/` si ya tenéis instruction files propios del equipo. El plugin no los sobreescribe.

## 3. Instalar el plugin

**Copilot CLI:**
```bash
/plugin add https://gitlabdes.hiberus.com/iasmartcommerce/conductor
```

**VS Code:**
1. Abre VS Code Settings y activa `chat.plugins.enabled` y `chat.subagents.allowInvocationsFromSubagents`
2. Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → `Chat: Install Plugin from Source`
3. Introduce `https://gitlabdes.hiberus.com/iasmartcommerce/conductor`

Ver [README > Instalar el plugin](../README.md#1-instalar-el-plugin) para más detalle.

## 4. Reinicializar el proyecto

```
/sdd-init
```

Regenera `openspec/` con el nuevo formato (`config.yaml`, estructura de `changes/` y `specs/`). Si guardaste tu `config.yaml` anterior, revisa el nuevo archivo generado y aplica las personalizaciones que tenías (comandos de test, build, etc.).

## 5. Generar instruction files (opcional)

```
/sdd-instructions
```

Este skill es nuevo. Analiza tu stack y genera `.github/instructions/` con convenciones básicas (naming, testing, arquitectura, etc.). Si ya tenéis instruction files bien organizados, no haría falta ejecutarlo — o solo añadiría algunas instrucciones complementarias sin sobreescribir las existentes.

## 6. Trabajar con el nuevo flujo

A partir de ahora, para trabajar cualquier tarea siempre con el agente `sdd-orchestrator` activo:

- **CLI:** `/agent` → selecciona `sdd-orchestrator`
- **VS Code:** en el selector de agentes del chat, elige `sdd-orchestrator`

Es el punto de entrada único al pipeline. El orchestrator evalúa la complejidad de tu petición y despacha a los subagentes (planner, coder, reviewer) automáticamente.

## Verificación

Comprueba que la migración fue correcta:

1. Escribe `/sdd-` y verifica que aparecen: `/sdd-init`, `/sdd-instructions`, `/sdd-status`, `/sdd-archive`
2. Escribe `/agent` y verifica que aparece `sdd-orchestrator`
3. Comprueba que `openspec/config.yaml` existe con el nuevo formato
