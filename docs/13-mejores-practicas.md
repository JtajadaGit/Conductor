# 🎯 Mejores Prácticas

[← Volver al README](../README.md)

## Principios Fundamentales

### 1. Deja que el orquestador orqueste

El orquestador es un coordinador, no un ejecutor. Su trabajo es mantener el hilo de la conversación, delegar trabajo real a sub-agentes y sintetizar resultados. No le pidas que "lea el código y me diga qué hace" — eso es trabajo de un sub-agente explore.

```
❌  "Lee src/auth/ y dime cómo funciona la autenticación"
     → El orquestador lee 15 archivos, infla su contexto, riesgo de compactación

✅  "Investiga cómo funciona la autenticación en src/auth/"
     → El orquestador delega a un sub-agente explore, recibe un resumen
```

### 2. Specs antes de código

El flujo SDD existe por una razón: las especificaciones formales reducen malentendidos, evitan re-trabajo y producen implementaciones más consistentes. Resiste la tentación de saltar directamente al código.

```
❌  "Implementa un sistema de MFA"
     → Implementación sin spec → requisitos ambiguos → correcciones costosas

✅  "/sdd-new add-mfa"
     → explore → propose → spec → design → tasks → apply (guiado) → verify
```

### 3. Batches pequeños en apply

Batches pequeños (2-3 tareas) son más fáciles de verificar y más baratos de rehacer si algo falla. Un batch grande que falla obliga a repetir todo el batch.

### 4. Siempre verificar antes de archivar

Nunca ejecutes `/sdd-archive` sin haber pasado `/sdd-verify` exitosamente. El archivado fusiona las specs delta con las principales; archivar código que no cumple la spec contamina la fuente de verdad.

---

## Patrones Recomendados

### Feature nueva

El flujo completo para una funcionalidad nueva:

```
/sdd-new mi-feature
  └── explore + propose (2 requests)

/sdd-continue    ← o /sdd-ff para saltar toda la planificación
  └── spec → design → tasks

/sdd-apply mi-feature
  └── Implementación en batches (2-4 requests)

/sdd-verify mi-feature
  └── Validación contra specs (1 request)

/sdd-archive mi-feature
  └── Cierre y archivado (1 request)
```

**Atajo rápido:**
```
/sdd-ff mi-feature           ← planificación completa (4 requests)
/sdd-apply mi-feature        ← implementación
/sdd-verify mi-feature       ← verificación
/sdd-archive mi-feature      ← cierre
```

### Bugfix rápido

Para correcciones que no requieren exploración:

```
/sdd-ff fix-login-timeout    ← planificación directa (4 requests)
/sdd-apply fix-login-timeout ← implementación (1-2 batches)
/sdd-verify fix-login-timeout
/sdd-archive fix-login-timeout
```

Si el bug es trivial y no justifica SDD, simplemente describe la corrección y deja que el orquestador delegue directamente (1 request).

### Refactor grande

Para refactorizaciones que afectan múltiples módulos:

```
/sdd-explore "refactorizar módulo de pagos para soportar múltiples proveedores"
  └── Investigación profunda del estado actual (1 request)

/sdd-new refactor-payments
  └── Propuesta basada en la exploración

/sdd-continue (spec → design → tasks)

/sdd-apply refactor-payments
  └── Batches pequeños (3-5 requests, recuperación más fácil)

/sdd-verify refactor-payments
/sdd-archive refactor-payments
```

### Revisión crítica

Para cambios de alto impacto que requieren revisión exhaustiva:

```
/sdd-ff critical-change
/sdd-apply critical-change
/sdd-verify critical-change     ← verificación estándar

judgment day                     ← revisión adversarial paralela
  └── 2 jueces independientes → síntesis → correcciones → re-verificación

/sdd-archive critical-change    ← solo después de aprobar verificación y judgment day
```

---

## Errores Comunes

### 1. Hacer trabajo inline en lugar de delegar

**El error:** Pedirle al orquestador que lea archivos, analice código o haga cambios directamente.

**El problema:** Infla el contexto del orquestador → compactación prematura → pérdida de estado.

**La solución:** Toda lectura de código, análisis y escritura se delega a sub-agentes.

### 2. Saltar la fase de specs ("solo codéalo")

**El error:** Ir directamente a implementación sin pasar por propose/spec/design.

**El problema:** Requisitos ambiguos, re-trabajo costoso, implementación inconsistente.

**La solución:** Usar `/sdd-ff` como mínimo — ejecuta la planificación completa en 4 requests.

### 3. No ejecutar `/sdd-init` primero

**El error:** Empezar un flujo SDD sin inicializar el contexto del proyecto.

**El problema:** Las fases no tienen información del stack, no se detectan test runners, no se genera el skill registry.

**La solución:** Ejecutar `/sdd-init` una vez al empezar a usar Conductor en un proyecto nuevo.

### 4. Archivar sin pasar verify

**El error:** Ejecutar `/sdd-archive` sin que `/sdd-verify` haya aprobado.

**El problema:** Las specs delta se fusionan con las principales. Si el código no cumple la spec, la fuente de verdad queda contaminada.

**La solución:** Siempre verify → archive. Sin excepciones.

### 5. Re-ejecutar verify sin cambios

**El error:** Volver a correr `/sdd-verify` después de una falla sin haber corregido el código.

**El problema:** Gasto de 1 premium request sin valor — el resultado será el mismo.

**La solución:** Primero corregir (via `/sdd-apply` o delegación directa), luego verificar.

### 6. Batches de apply demasiado grandes

**El error:** Intentar implementar 8-10 tareas en un solo batch.

**El problema:** Si algo falla, hay que rehacer todo el batch. Mayor riesgo de errores compuestos.

**La solución:** Batches de 2-3 tareas para features complejos; hasta 5 para cambios mecánicos.

### 7. Ignorar el skill registry

**El error:** Crear skills pero no ejecutar `/skill-registry` para registrarlas.

**El problema:** El orquestador no descubre la skill y no la inyecta en los sub-agentes.

**La solución:** Siempre ejecutar `/skill-registry` o "update skills" después de crear o modificar skills.

---

## Optimización de Costes

### Resumen de estrategias

| Estrategia                     | Ahorro                         | Impacto en calidad               |
| ------------------------------ | ------------------------------ | -------------------------------- |
| `/sdd-ff` para planificación   | Reduce overhead conversacional | Ninguno                          |
| Omitir explore                 | -1 request                     | Aceptable si el cambio es claro  |
| Batches grandes en apply       | -1-2 requests                  | Menor recuperación ante errores  |
| Evitar re-verify sin cambios   | -1 request por iteración       | Ninguno                          |
| Modelo sonnet en lugar de opus | Reducción significativa        | Menor profundidad arquitectónica |
| Delegación directa sin SDD     | Solo 1 request                 | Adecuado para tareas simples     |

### Regla general

Para tareas pequeñas (< 2 archivos, cambio claro): **delegación directa** (1 request).

Para features medianos: **`/sdd-ff` + apply + verify** (8-12 requests).

Para features grandes o críticos: **flujo SDD completo + judgment day** (13-20 requests).

Consulta [Consumo de Tokens](./10-consumo-tokens.md) para un análisis detallado.

---

## Trabajo en Equipo

### Comparte la configuración de Conductor vía git

Los directorios `.claude/`, `.github/`, `openspec/` y `.atl/` deben estar en el repositorio. Esto garantiza que todos los miembros del equipo trabajan con las mismas instrucciones del orquestador, las mismas skills y el mismo contexto SDD.

```gitignore
# NO ignorar estos directorios:
# .claude/
# .github/
# .atl/
# openspec/
```

### Mantén un skill registry consistente

Si un miembro del equipo agrega una skill nueva, debe ejecutar `/skill-registry` y hacer commit de `.atl/skill-registry.md`. El resto del equipo obtiene las nuevas skills al hacer pull.

### Crea skills personalizadas para patrones del proyecto

Las skills son la herramienta más poderosa para mantener consistencia entre agentes. Si tu equipo tiene convenciones específicas —naming, estructura de archivos, patrones de testing— documéntalas como skills.

```
Convención del equipo             → Skill personalizada
"Usamos Zustand para estado"      → myapp-state
"Los endpoints siguen REST puro"  → myapp-api
"Tests con Testing Library"       → myapp-test-components
```

### Usa OpenSpec para cambios persistentes

En equipos, el modo `openspec` es casi siempre preferible a `none`. Permite:

- Que un miembro inicie un cambio y otro lo continúe.
- Revisión de artefactos SDD en PRs (la propuesta, spec y diseño son revisables).
- Historial de decisiones arquitectónicas en el archivo de cambios.

---

## FAQ

### ¿Puedo usar Conductor sin SDD?

**Sí.** Las skills individuales funcionan independientemente del flujo SDD. Puedes usar Conductor solo como un framework de skills para tus agentes IA, delegando tareas puntuales sin pasar por el ciclo completo de planificación.

### ¿Funciona con otros editores?

**Sí.** Conductor funciona con cualquier editor o entorno que soporte Claude Code (terminal) o GitHub Copilot (VS Code, CLI). Consulta [Plataformas Compatibles](./08-plataformas-compatibles.md) para detalles.

### ¿Puedo mezclar Claude y Copilot en el mismo proyecto?

**Sí.** Los directorios `.claude/` y `.github/` coexisten sin conflicto. Las skills son idénticas en contenido; solo el archivo del orquestador difiere. OpenSpec y el skill registry (`.atl/`) son compartidos entre ambas plataformas.

### ¿Qué pasa si se pierde el contexto?

Si estás usando modo `openspec`, el orquestador lee `state.yaml` para reconstruir el estado exacto del cambio y continúa desde donde se quedó. Si estás en modo `none`, el estado se pierde — esta es la razón principal para usar `openspec` en proyectos serios.

### ¿Puedo crear skills en inglés?

**Sí.** El idioma de las skills es flexible. Dado que los agentes IA procesan texto en cualquier idioma, puedes escribir skills en español, inglés o cualquier otro idioma. Lo importante es la consistencia dentro del proyecto.

### ¿Es obligatorio TDD?

**No.** El modo TDD estricto es condicional y configurable. Se activa solo cuando `strict_tdd: true` está en `openspec/config.yaml` Y existe un test runner detectado. Si no se activa, los módulos TDD consumen exactamente 0 tokens.

### ¿Cuántos premium requests usa un ciclo SDD?

Un ciclo típico consume **~11 premium requests** (init + explore + propose + spec + design + tasks + apply×3 + verify). El rango realista es **10-15** dependiendo del tamaño del feature y las correcciones necesarias.

### ¿Judgment Day consume muchos requests?

Un ciclo de Judgment Day consume **3-5 premium requests** (2 jueces + 1 fix + 2 re-jueces opcional). Si escala a 2 iteraciones completas, puede llegar a 8-10. Se recomienda reservarlo para cambios de alto impacto.

### ¿Puedo personalizar las reglas por fase?

**Sí.** El archivo `openspec/config.yaml` contiene una sección `rules` con reglas específicas por fase (proposal, specs, design, tasks, apply, verify, archive). Modifica estas reglas para adaptar el comportamiento de cada fase a las necesidades de tu proyecto.

### ¿Qué pasa si opus no está disponible?

El orquestador sustituye automáticamente por sonnet. El sistema sigue siendo funcional; las propuestas y diseños serán correctos pero con menor profundidad en el análisis de trade-offs.

---

## Checklist de Onboarding

Para nuevos miembros del equipo que se incorporan a un proyecto con Conductor:

### Día 1: Setup

- [ ] Clonar el repositorio (incluye `.claude/`, `.github/`, `openspec/`, `.atl/`).
- [ ] Verificar que la plataforma de agentes está configurada (Claude Code o Copilot).
- [ ] Abrir el proyecto y verificar que el orquestador responde.
- [ ] Ejecutar `/sdd-init` para confirmar que el contexto se detecta correctamente.
- [ ] Revisar `.atl/skill-registry.md` para conocer las skills disponibles.

### Día 1-2: Familiarización

- [ ] Leer `openspec/config.yaml` para entender el stack y las convenciones.
- [ ] Revisar las skills del proyecto en `.claude/skills/` o `.github/skills/`.
- [ ] Hacer una tarea pequeña usando delegación directa (sin SDD) para probar el flujo.
- [ ] Revisar un cambio archivado en `openspec/changes/archive/` para entender el formato de artefactos.

### Primera semana: Primer flujo SDD

- [ ] Elegir un cambio pequeño (bugfix o mejora menor).
- [ ] Ejecutar el flujo completo: `/sdd-ff` → `/sdd-apply` → `/sdd-verify` → `/sdd-archive`.
- [ ] Revisar los artefactos generados (propuesta, spec, diseño, tareas).
- [ ] Confirmar que verify pasa antes de archivar.
- [ ] Hacer commit de los artefactos junto con el código.

### Referencia rápida de comandos

| Quiero...                     | Comando                 |
| ----------------------------- | ----------------------- |
| Inicializar Conductor         | `/sdd-init`             |
| Explorar una idea             | `/sdd-explore <tema>`   |
| Iniciar un cambio nuevo       | `/sdd-new <nombre>`     |
| Planificación rápida completa | `/sdd-ff <nombre>`      |
| Avanzar al siguiente paso     | `/sdd-continue`         |
| Implementar las tareas        | `/sdd-apply <nombre>`   |
| Verificar la implementación   | `/sdd-verify <nombre>`  |
| Archivar el cambio            | `/sdd-archive <nombre>` |
| Revisión adversarial          | `judgment day`          |
| Actualizar skills             | `/skill-registry`       |

---

[← Anterior: Comandos](./12-comandos-referencia.md) | [Volver al README](../README.md)
