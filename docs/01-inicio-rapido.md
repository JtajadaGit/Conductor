# 🚀 Inicio Rápido

[← Volver al README](../README.md)

Guía paso a paso para tener Conductor funcionando en tu proyecto en menos de 5 minutos.

---

## Requisitos previos

| Requisito              | Descripción                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Plataforma IA**      | Licencia activa de **GitHub Copilot** (plan Individual, Business o Enterprise) **o** acceso a **Claude Code** (Anthropic) |
| **Editor**             | VS Code con extensión GitHub Copilot **o** Claude Code en terminal                                                        |
| **Git**                | Repositorio git inicializado en tu proyecto                                                                               |
| **Proyecto existente** | Conductor se integra en proyectos existentes — no genera proyectos desde cero                                             |

> **Nota**: No necesitas ambas plataformas. Elige la que uses y copia solo la configuración correspondiente.

---

## Instalación paso a paso

### Paso 1: Obtener Conductor

```bash
# Opción A: Clonar el repositorio completo
git clone https://github.com/tu-org/Conductor.git

# Opción B: Descargar solo los archivos (sin historial git)
# Descarga el ZIP desde GitHub y descomprime
```

### Paso 2: Copiar la configuración a tu proyecto

Copia **únicamente** los archivos de la plataforma que uses:

#### Para GitHub Copilot (VS Code / CLI)

**Linux/Mac:**
```bash
# Copiar instrucciones del orquestador
cp Conductor/instructions/copilot-instructions.md tu-proyecto/.github/copilot-instructions.md
# Copiar skills
cp -r Conductor/skills/ tu-proyecto/.github/skills/
```

**Windows PowerShell:**
```powershell
# Copiar instrucciones del orquestador
Copy-Item Conductor\instructions\copilot-instructions.md tu-proyecto\.github\copilot-instructions.md
# Copiar skills
Copy-Item -Recurse Conductor\skills\ tu-proyecto\.github\skills\
```

Esto copia:
- `instructions/copilot-instructions.md` → `.github/copilot-instructions.md` — instrucciones del orquestador
- `skills/` → `.github/skills/` — todos los skills SDD y utilidades

#### Para Claude Code

**Linux/Mac:**
```bash
# Copiar instrucciones del orquestador
cp Conductor/instructions/CLAUDE.md tu-proyecto/.claude/CLAUDE.md
# Copiar skills
cp -r Conductor/skills/ tu-proyecto/.claude/skills/
```

**Windows PowerShell:**
```powershell
# Copiar instrucciones del orquestador
Copy-Item Conductor\instructions\CLAUDE.md tu-proyecto\.claude\CLAUDE.md
# Copiar skills
Copy-Item -Recurse Conductor\skills\ tu-proyecto\.claude\skills\
```

Esto copia:
- `instructions/CLAUDE.md` → `.claude/CLAUDE.md` — instrucciones del orquestador
- `skills/` → `.claude/skills/` — todos los skills SDD y utilidades

#### Para ambas plataformas

**Linux/Mac:**
```bash
# Copilot
cp Conductor/instructions/copilot-instructions.md tu-proyecto/.github/copilot-instructions.md
cp -r Conductor/skills/ tu-proyecto/.github/skills/

# Claude Code
cp Conductor/instructions/CLAUDE.md tu-proyecto/.claude/CLAUDE.md
cp -r Conductor/skills/ tu-proyecto/.claude/skills/
```

**Windows PowerShell:**
```powershell
# Copilot
Copy-Item Conductor\instructions\copilot-instructions.md tu-proyecto\.github\copilot-instructions.md
Copy-Item -Recurse Conductor\skills\ tu-proyecto\.github\skills\

# Claude Code
Copy-Item Conductor\instructions\CLAUDE.md tu-proyecto\.claude\CLAUDE.md
Copy-Item -Recurse Conductor\skills\ tu-proyecto\.claude\skills\
```

> **Tip**: En Conductor, los skills se mantienen en una sola copia (`skills/`) sin duplicación. Al desplegar, se copian al directorio que cada plataforma espera (`.github/skills/` o `.claude/skills/`).

### Paso 3: Verificar la estructura

Tu proyecto debería tener esta estructura (ejemplo con Copilot):

```
tu-proyecto/
├── .github/
│   ├── copilot-instructions.md     ← Orquestador
│   └── skills/
│       ├── _shared/                ← Protocolos compartidos
│       ├── sdd-init/SKILL.md       ← Inicialización
│       ├── sdd-explore/SKILL.md    ← Exploración
│       ├── sdd-propose/SKILL.md    ← Propuestas
│       ├── sdd-spec/SKILL.md       ← Especificaciones
│       ├── sdd-design/SKILL.md     ← Diseño técnico
│       ├── sdd-tasks/SKILL.md      ← Desglose de tareas
│       ├── sdd-apply/SKILL.md      ← Implementación
│       ├── sdd-verify/SKILL.md     ← Verificación
│       ├── sdd-archive/SKILL.md    ← Archivado
│       ├── judgment-day/SKILL.md   ← Revisión adversarial
│       ├── skill-creator/SKILL.md  ← Creador de skills
│       └── skill-registry/SKILL.md ← Registro de skills
├── src/                            ← Tu código existente
├── package.json                    ← Tu proyecto existente
└── ...
```

---

## Configuración por plataforma

### GitHub Copilot (VS Code)

1. Asegúrate de tener la extensión **GitHub Copilot** instalada y activa
2. Abre tu proyecto en VS Code
3. Copilot detectará automáticamente `.github/copilot-instructions.md` como instrucciones del agente
4. Los skills en `.github/skills/` estarán disponibles como comandos

**Verificación**: Abre el chat de Copilot y escribe `/sdd-init`. Si Copilot reconoce el comando, la configuración es correcta.

### GitHub Copilot CLI (Terminal)

1. Instala el CLI de GitHub Copilot si no lo tienes
2. Navega a tu proyecto en la terminal
3. La configuración `.github/` se detecta automáticamente
4. Usa los comandos directamente en la conversación

### Claude Code

1. Abre Claude Code en la terminal
2. Navega a tu proyecto
3. Claude Code detectará automáticamente `.claude/CLAUDE.md` como instrucciones
4. Los skills en `.claude/skills/` estarán disponibles como comandos slash

**Verificación**: En Claude Code, escribe `/sdd-init`. Si reconoce el skill, la configuración es correcta.

---

## Primer uso: `/sdd-init`

El primer comando que debes ejecutar en cualquier proyecto nuevo es:

```
/sdd-init
```

### ¿Qué hace `sdd-init`?

1. **Detecta tu stack tecnológico** — lenguaje, framework, herramientas de build
2. **Detecta tu framework de testing** — Jest, pytest, Go test, etc.
3. **Detecta convenciones** — estructura de directorios, patrones de código
4. **Crea la configuración OpenSpec** (si se habilita):
   ```
   openspec/
   ├── config.yaml          ← Configuración del proyecto
   ├── specs/               ← Especificaciones principales
   └── changes/             ← Cambios activos
       └── archive/         ← Cambios completados
   ```
5. **Genera el skill registry** — `.atl/skill-registry.md` con las reglas compactas del proyecto

### Resultado esperado

Después de ejecutar `/sdd-init`, el orquestador te mostrará un resumen:

```
✅ SDD inicializado
   Stack: Node.js + TypeScript + Express
   Testing: Jest (detectado)
   TDD estricto: deshabilitado (habilitar en config)
   Persistencia: none (recomendado: openspec)
   Skill registry: generado
```

> **Tip**: Si quieres habilitar persistencia en disco, dile al orquestador: "Habilita openspec" antes o después de init.

---

## Primer feature: `/sdd-new`

Una vez inicializado, crea tu primer feature:

```
/sdd-new autenticación-jwt
```

### Walkthrough completo

#### 1. Exploración automática

El orquestador lanza un sub-agente de exploración que:
- Investiga tu codebase existente
- Identifica dependencias relevantes
- Analiza patrones de código actuales
- Evalúa el impacto del cambio propuesto

```
🔍 Explorando codebase para: autenticación-jwt
   → Analizando estructura de rutas...
   → Detectando middleware existente...
   → Identificando patrones de autenticación...
✅ Exploración completada
```

#### 2. Propuesta automática

Inmediatamente después, lanza un sub-agente de propuesta que:
- Genera una propuesta de cambio concisa (< 400 palabras)
- Define el alcance y enfoque
- Identifica riesgos y alternativas

```
📋 Propuesta generada: autenticación-jwt
   Alcance: Implementar JWT auth con login, logout y refresh
   Archivos afectados: ~5
   Riesgo: bajo
   
   ¿Continuar con la especificación? Usa /sdd-continue
```

#### 3. Avanzar con el flujo

Desde aquí tienes dos opciones:

**Opción A: Paso a paso** (más control)
```
/sdd-continue autenticación-jwt    # → spec
/sdd-continue autenticación-jwt    # → design
/sdd-continue autenticación-jwt    # → tasks
/sdd-continue autenticación-jwt    # → apply (batch 1)
/sdd-continue autenticación-jwt    # → apply (batch 2)
...
/sdd-continue autenticación-jwt    # → verify
/sdd-continue autenticación-jwt    # → archive
```

**Opción B: Fast-forward** (más rápido)
```
/sdd-ff autenticación-jwt          # → spec + design + tasks (todo el plan)
/sdd-apply autenticación-jwt       # → implementar
/sdd-verify autenticación-jwt      # → verificar
/sdd-archive autenticación-jwt     # → cerrar
```

> 📖 Para el flujo completo detallado, ver [Flujo SDD Completo](./03-flujo-sdd-completo.md).

---

## Verificación de que funciona

### Checklist rápido

- [ ] Ejecutar `/sdd-init` responde con detección de stack ✅
- [ ] Ejecutar `/sdd-new test-feature` genera exploración + propuesta ✅
- [ ] El orquestador delega a sub-agentes (no ejecuta código inline) ✅
- [ ] Los artefactos se crean en `openspec/changes/` (si OpenSpec está habilitado) ✅

### Señales de que NO está funcionando

| Síntoma                                | Causa probable                            | Solución                                       |
| -------------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| El agente no reconoce `/sdd-init`      | Archivos de configuración no copiados     | Verifica que `.github/` o `.claude/` existen   |
| El agente ejecuta código directamente  | Instrucciones del orquestador no cargadas | Verifica el archivo de instrucciones principal |
| No se crean artefactos en disco        | Persistencia en modo `none`               | Habilita OpenSpec: "activa openspec"           |
| Los sub-agentes no siguen convenciones | Skill registry no generado                | Ejecuta `/skill-registry` o `/sdd-init`        |

---

## Troubleshooting básico

### "El comando `/sdd-init` no es reconocido"

**Causa**: Los archivos de skills no están en la ubicación correcta.

**Solución**:
1. Verifica que el directorio de skills existe:
   - Copilot: `.github/skills/sdd-init/SKILL.md`
   - Claude: `.claude/skills/sdd-init/SKILL.md`
2. Reinicia el editor o la sesión del agente
3. Confirma que la extensión/herramienta de IA está activa

### "El orquestador lee código y edita archivos directamente"

**Causa**: Las instrucciones del orquestador no se cargaron correctamente.

**Solución**:
1. Verifica que existe el archivo de instrucciones:
   - Copilot: `.github/copilot-instructions.md`
   - Claude: `.claude/CLAUDE.md`
2. El contenido debe incluir las reglas de delegación ("You are a COORDINATOR, not an executor")
3. Inicia una nueva sesión de chat

### "Los artefactos no se persisten entre sesiones"

**Causa**: OpenSpec no está habilitado (modo `none` por defecto).

**Solución**:
1. Dile al orquestador: "Habilita openspec"
2. O ejecuta `/sdd-init` y solicita persistencia
3. Verifica que se creó el directorio `openspec/` en la raíz del proyecto

### "Los sub-agentes no siguen las convenciones del proyecto"

**Causa**: El skill registry no está generado o está desactualizado.

**Solución**:
1. Ejecuta `/skill-registry` o di "actualizar skills"
2. Verifica que existe `.atl/skill-registry.md`
3. El orquestador resolverá las reglas automáticamente en la siguiente delegación

### "El flujo SDD se interrumpió a mitad de camino"

**Causa**: La sesión se cerró o el contexto se compactó.

**Solución**:
1. Si tienes OpenSpec habilitado: ejecuta `/sdd-continue [nombre-del-cambio]` — el orquestador leerá `state.yaml` y retomará desde donde quedó
2. Si no tienes OpenSpec: el estado se perdió — tendrás que re-ejecutar las fases completadas

---

## Siguientes pasos

- 📖 [Arquitectura y modelo de agentes](./02-arquitectura.md) — entiende cómo funciona internamente
- 📖 [Flujo SDD completo](./03-flujo-sdd-completo.md) — domina cada fase del flujo
- 📖 [Referencia de comandos](./12-comandos-referencia.md) — todos los comandos disponibles
- 📖 [Consumo de tokens](./10-consumo-tokens.md) — optimiza tu uso de recursos

---

[Volver al README](../README.md) | [Siguiente: Arquitectura →](./02-arquitectura.md)
