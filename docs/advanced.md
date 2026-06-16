# Avanzado — Optimización, buenas prácticas y troubleshooting

---

## Tabla de contenidos

1. [Optimización de tokens](#1-optimización-de-tokens)
2. [Buenas prácticas](#2-buenas-prácticas)
3. [Anti-patrones](#3-anti-patrones)
4. [Git y seguridad](#4-git-y-seguridad)
5. [Delegación síncrona](#5-delegación-síncrona)
6. [Verificación de artefactos (delay reads)](#6-verificación-de-artefactos-delay-reads)
7. [Comportamiento del reviewer](#7-comportamiento-del-reviewer)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Optimización de tokens

| Estrategia | Cómo funciona | Ahorro |
|------------|---------------|--------|
| **Modo auto (`--auto`)** | Añadir `--auto` al prompt del usuario — cero pausas, cero roundtrips extra | Elimina tokens de interacción con el usuario |
| **Instruction files compactos** | Mantener cada fichero por debajo de 200 palabras; usar tablas en vez de prosa | Reduce tokens cargados por la plataforma en cada coincidencia |
| **Specs en tablas** | Tablas en vez de párrafos: 600 palabras vs 2000 para el mismo contenido | Reduce la carga de tokens en cada fase posterior |
| **Patrones applyTo acotados** | Patrones estrechos (p. ej., `src/features/**/*.ts`) en vez de amplios (`**/*.ts`) | Los instruction files se cargan solo cuando son relevantes |
| **Archivar cambios completados** | Ejecutar `/sdd-archive` tras un PASS — elimina artefactos activos del contexto | Evita que contexto obsoleto infle futuras lecturas |

### Escribir peticiones efectivas

La calidad de tu petición impacta directamente en la eficiencia de tokens.

| Calidad de la petición | Ejemplo | Coste en tokens |
|------------------------|---------|-----------------|
| Vaga | "mejorar la página de producto" | Alto — el planner necesita explorar, proponer y clarificar |
| Alcance claro, sin detalles | "añadir paginación a la lista de productos" | Medio — el planner produce spec + design + tasks en una llamada |
| Detallada (scope + approach + criteria) | "añadir paginación por cursor a `ProductListComponent`, usar el `ApiService.get()` existente, añadir skeleton de carga, testear con 0/1/N elementos" | Bajo — el planner produce artefactos directamente sin roundtrips |

---

## 2. Buenas prácticas

| Práctica | Justificación |
|----------|---------------|
| Deja que el orchestrator orqueste | Nunca le pidas que lea código o edite ficheros directamente. Él despacha a sub-agentes. Pedirle trabajo de sub-agente infla su contexto sin beneficio. |
| Usa `sdd-orchestrator` para cualquier feature que toque 3+ ficheros | El pipeline detecta problemas de diseño antes de escribir código |
| Mantener batches de apply pequeños (2-3 tareas) | Fácil de rehacer si un batch falla. Batches grandes obligan a rehacer todo. |
| Siempre verificar antes de archivar | `/sdd-archive` sin verify contamina la fuente de verdad en `openspec/specs/` |
| Configurar `post_hook` en `config.yaml` | Detecta errores de build y type-check durante apply. Ejemplo: `post_hook: "npm run build"` |
| Documentar gotchas en `openspec/lessons-learned.md` | Las sesiones futuras arrancan con contexto de errores pasados |
| Re-ejecutar `/sdd-init` + `/sdd-instructions` cuando cambie el stack | Mantiene la detección y los instruction files al día |
| Acotar los instruction files | Usa patrones `applyTo` específicos. Patrones amplios gastan tokens en ficheros irrelevantes. |
| Usar modo interactivo en dominios desconocidos | Sin `--auto` puedes revisar la spec antes de que el coder implemente |
| Monitorizar el subagente activo con `/tasks` | El orchestrator despacha cada subagente síncronamente (`wait: true`); `/tasks` muestra cuál está en curso en Copilot CLI |

---

## 3. Anti-patrones

| Anti-patrón | Por qué es dañino | Qué hacer en su lugar |
|-------------|-------------------|-----------------------|
| Pedir al orchestrator que edite ficheros | Infla el contexto, elude la especialización de los sub-agentes | Dejar que delegue en `sdd-coder` |
| Archivar sin verificar | Contamina `openspec/specs/` con specs no validadas | Siempre ejecutar verify primero |
| Re-ejecutar verify sin cambios en el código | Coste en tokens sin ningún valor | Corregir el código primero, luego verify |
| Batches de apply de 8-10 tareas | Si una falla, hay que rehacer todo el batch | Batches de 2-3 tareas |
| Forzar SDD en tareas triviales | La Complexity Gate existe para saltarse el pipeline en cambios pequeños | Confiar en la gate; usar `sdd-orchestrator` y dejar que clasifique |
| Editar `state.yaml` manualmente | Puede dejar el seguimiento de fases incoherente | Si está corrupto, borrarlo y relanzar al orchestrator: los agentes lo reescribirán al avanzar de fase |
| Instruction files con `applyTo: "**"` | Carga tokens en TODAS las interacciones del agente sin importar el tipo de fichero | Usar patrones específicos: `**/*.ts`, `src/api/**/*.java` |
| Pegar ficheros enteros en la petición | Gasta tokens de la petición; los agentes pueden leer ficheros por sí mismos | Referenciar rutas de ficheros; dejar que los agentes lean |
| Saltarse `/sdd-init` | Los agentes carecen de contexto del stack y de los comandos de test/build | Siempre ejecutar init antes del primer uso |

---

## 4. Git y seguridad

### Git está bloqueado

Todas las operaciones git están **vetadas en el frontmatter `tools` y en la sección FORBIDDEN/Scope de cada agente**. Esto es por diseño.

| Lo que los agentes SÍ hacen | Lo que los agentes NO pueden hacer |
|-----------------------------|------------------------------------|
| Leer ficheros | `git commit`, `git push`, `git checkout` |
| Escribir código y specs | `git merge`, `git rebase`, `git stash` |
| Ejecutar comandos configurados de test/build | Cualquier comando `git` |
| Recomendar commits en informes | Ejecutar esas recomendaciones |

El reviewer o el orchestrator pueden sugerir un mensaje de commit en sus informes. **Tú ejecutas los comandos git.** Esto evita que los agentes hagan cambios irreversibles en el repositorio.

### Comandos bloqueados

| Categoría | Comandos bloqueados |
|-----------|---------------------|
| Control de versiones | `git` (todas las operaciones) |
| Red | `curl`, `wget`, `Invoke-WebRequest`, `web_fetch` |
| Destructivos | `rm -rf`, `rmdir /s` (borrado recursivo) |
| Creación de ficheros vía shell | `Set-Content`, `echo >`, `cat <<` (debe usar herramientas de edit/write) |

### Uso de shell — Lo que SÍ está permitido

| Permitido | Ejemplo |
|-----------|---------|
| Creación de directorios | `mkdir -p openspec/changes/my-feature/` |
| Comandos de build | `npm run build`, `mvn compile` |
| Comandos de test | `npm test -- --watch=false`, `pytest` |
| Linters/formatters | `npx eslint src/`, `npx prettier --check` |

---

## 5. Delegación síncrona

El orchestrator despacha sub-agentes nombrados (`sdd-planner`, `sdd-coder`, `sdd-reviewer`) **secuencialmente y con `wait: true`**. Cada llamada bloquea hasta que el subagente termina y sus ficheros quedan visibles; sólo entonces el orchestrator pasa a la fase siguiente. No hay ejecución en paralelo ni fan-out.

### Cómo funciona la delegación

| Paso | Qué ocurre |
|------|------------|
| 1 | El orchestrator lee `config.yaml` y deriva complejidad, change-name y dominio |
| 2 | Despacha al planner una fase cada vez (propose, spec, y según complejidad explore/clarify/design/tasks) y verifica el artefacto en disco antes de avanzar |
| 3 | Despacha `sdd-coder` para `apply` — implementa según spec + instruction files |
| 4 | Despacha `sdd-reviewer` para `verify` — valida contra spec y ejecuta los comandos configurados |
| 5 | Si el reviewer emite FAIL, el orchestrator entra en el bucle de fix (`max_review_cycles` de `config.yaml`) |

El orchestrator **nunca** despacha dos agentes a la vez ni redispatcha la misma fase si el artefacto no aparece tras los reintentos de verificación: en ese caso imprime `❌ FAIL` y se detiene.

### Monitorizar el progreso

| Comando | Propósito |
|---------|-----------|
| `/tasks` | En Copilot CLI muestra el subagente activo (siempre uno a la vez) |
| `/sdd-status` | Lee `state.yaml` y muestra la fase actual y los artefactos existentes |

---

## 6. Verificación de artefactos (delay reads)

Cuando un sub-agente notifica que ha completado su trabajo, el orchestrator (o el siguiente sub-agente en la cadena) debe **verificar que los artefactos existen antes de leerlos**. Si se intenta leer un artefacto inmediatamente después de la notificación, puede producirse un error `✗` porque el fichero aún no está disponible en disco.

### Protocolo de verificación

| Paso | Acción | Ejemplo |
|------|--------|---------|
| 1 | Recibir notificación del sub-agente | "Planner completado" |
| 2 | **Listar el directorio** del artefacto esperado | `ls openspec/changes/my-feature/` |
| 3 | Confirmar que el fichero aparece en el listado | Verificar que `spec.md`, `design.md`, etc. existen |
| 4 | Solo entonces leer el artefacto | Leer `openspec/changes/my-feature/spec.md` |

### Por qué es necesario

| Sin delay reads | Con delay reads |
|-----------------|-----------------|
| `read spec.md` → error `✗` fichero no encontrado | `ls changes/my-feature/` → confirma existencia → `read spec.md` → éxito |
| El agente entra en bucle de reintentos gastando tokens | Una operación extra de listado, cero errores |

Este protocolo aplica a **todos los artefactos producidos por sub-agentes**: specs, design, tasks, state.yaml, apply-report.md y verify-report.md.

---

## 7. Comportamiento del reviewer

El reviewer es **de solo lectura** y ejecuta **únicamente comandos de test configurados**.

### Qué hace el reviewer

| Acción | Detalles |
|--------|----------|
| Lee spec, informe de apply y ficheros fuente | Compara la implementación contra la especificación |
| Puntúa cada escenario | COMPLIANT, PARTIAL, FAILING o UNTESTED |
| Ejecuta el comando de test configurado | Desde la fase `verify` en `x-conductor.pipeline.phases[verify].test_command` |
| Ejecuta el comando de build configurado | Desde la fase `verify` en `x-conductor.pipeline.phases[verify].build_command` |
| Produce `verify-report.md` | Con veredicto: PASS, PASS_WARNINGS o FAIL |

### Qué NO puede hacer el reviewer

| Restricción | Razón |
|-------------|-------|
| Editar código fuente | Rol de solo lectura; separación de responsabilidades |
| Crear o modificar ficheros de test | Solo valida, nunca corrige |
| Instalar dependencias | No puede modificar la configuración del proyecto |
| Inventar comandos de test | Ejecuta ÚNICAMENTE lo que especifica `config.yaml` |
| Abrir navegadores o terminales interactivas | Siempre añade flags `--watch=false`, `--no-watch`, `--run` |

### Si no hay comando de test configurado

El reviewer omite la ejecución de tests y anota "No test command configured" en el informe. Aún así realiza comprobaciones estáticas (cumplimiento de spec, existencia de ficheros, cobertura de escenarios).

---

## 8. Troubleshooting

### Problemas del pipeline

| Problema | Causa | Solución |
|----------|-------|----------|
| Build falla tras apply | Apply no compila salvo que se configure `post_hook` | Configurar `post_hook: "npm run build"` en `config.yaml` |
| Tests se quedan colgados en verify | El test runner espera input interactivo o el timeout es demasiado corto | Verificar que `verify.test_command` no requiere stdin; añadir `--watch=false` |
| Instruction files no detectados | `/sdd-instructions` no ejecutado o plataforma no detectada | Ejecutar `/sdd-init` + `/sdd-instructions` |
| Los agentes no escriben ficheros | El sub-agente agotó su contexto por una lista de tareas demasiado grande | Reducir tamaño del batch; el orchestrator reintenta una vez automáticamente |
| El orchestrator vuelve a empezar desde cero un cambio ya iniciado | El usuario relanzó la petición sin describir lo ya hecho | Indicar en el prompt el `change-name` y el estado actual; `/sdd-status` te lo muestra |

### Problemas de estado y recuperación

| Problema | Causa | Solución |
|----------|-------|----------|
| `state.yaml` inconsistente | Crash durante delegación o edición manual | Borrar `state.yaml` y relanzar al orchestrator con el mismo prompt; los artefactos existentes se respetan |
| Sub-agentes ignoran convenciones tras compactación | Los instruction files se recargan por interacción pero pueden faltar | Ejecutar `/sdd-instructions` para regenerar |
| Pipeline atascado tras apply parcial | Algunas tareas marcadas `[x]` en `tasks.md`, otras no | Relanzar al orchestrator con el mismo `change-name`; el coder verá los checkboxes pendientes en `tasks.md` |
| Artefactos de un cambio anterior interfieren | Se olvidó archivar | Ejecutar `/sdd-archive` para cambios completados, o mover manualmente a `openspec/changes/archive/` |

### Problemas de configuración

| Problema | Causa | Solución |
|----------|-------|----------|
| Plugin no detectado | `plugin.json` ausente o settings no habilitados | Verificar que `plugin.json` está en `.github/` y `chat.plugins.enabled: true` |
| El orchestrator no consigue invocar subagentes en VS Code | Setting necesario desactivado | Habilitar `chat.subagents.allowInvocationsFromSubagents: true` en los settings de VS Code (la ejecución sigue siendo síncrona — `wait: true` — no es background) |
| `/sdd-init` no reconocido | Skills no cargados | Comprobar instalación del plugin; verificar el array `skills` en `plugin.json` |
| `sdd-orchestrator` no aparece en el selector de agentes | Faltan campos requeridos en la configuración del agente | Verificar `disable-model-invocation: true` y `user-invocable: true` en el fichero del agente |
| El reviewer ejecuta comandos de test inesperados | Comando de test mal configurado en `config.yaml` | Comprobar `x-conductor.pipeline.phases[verify].test_command`; el reviewer ejecuta ÚNICAMENTE este comando |

### Problemas de calidad de la IA

| Problema | Causa | Solución |
|----------|-------|----------|
| La IA usa patrones obsoletos del framework | El corte de entrenamiento del modelo es anterior a la versión de tu framework | Añadir reglas específicas de versión en instruction files; configurar `post_hook` para detectar errores |
| La IA ignora convenciones del equipo | Convenciones no documentadas en instruction files | Añadirlas a `.github/instructions/` con el `applyTo` correcto |
| La IA genera código en el directorio equivocado | Arquitectura no especificada | Añadir reglas de estructura de directorios en instruction files |
| La IA produce specs demasiado extensas | Estilo por defecto en prosa | Añadir regla: "Tablas en vez de párrafos, presupuesto: <650 palabras por spec" |
| La IA crea ficheros vía comandos shell | Se usó shell en vez de herramientas de edit/write | El frontmatter `tools` del agente debe restringir esto; si ocurre, reportar como bug del agente |

### Chuleta de recuperación

| Situación | Comando |
|-----------|---------|
| Comprobar estado actual del pipeline | `/sdd-status` |
| Ver el subagente activo (Copilot CLI) | `/tasks` |
| Reanudar un cambio interrumpido | Relanzar al orchestrator con el mismo `change-name`; los artefactos existentes y `state.yaml` se respetan |
| Resetear estado corrupto | Borrar `state.yaml` y relanzar al orchestrator |
| Archivar trabajo completado | `/sdd-archive` |
| Regenerar instruction files | `/sdd-instructions` |
| Re-detectar stack tras cambios | `/sdd-init` |

---

Siguiente: [Primeros pasos](./getting-started.md) | [Pipeline SDD](./pipeline.md) | [OpenSpec](./openspec.md) | [Stacks](./stacks.md)
