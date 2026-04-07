# 💰 Consumo de Tokens y Premium Requests

[← Volver al README](../README.md)

## ¿Cómo Consume Tokens Conductor?

Conductor opera en dos capas que generan consumo de tokens de formas fundamentalmente distintas:

### Orquestador (conversación continua)

El orquestador mantiene una conversación persistente con el usuario. Cada mensaje enviado, cada respuesta generada y cada resultado de sub-agente procesado **acumula tokens** en esa misma conversación. A medida que la sesión avanza, el contexto crece.

```
Mensaje 1 ─────────────────────── 500 tokens
Mensaje 2 ─────────────────────── 1.200 tokens (acumulados)
Resultado sub-agente ───────────── 2.500 tokens (acumulados)
Mensaje 3 ─────────────────────── 3.800 tokens (acumulados)
    ...
Compactación ───────────────────── contexto se reduce
```

### Sub-agentes (contexto fresco)

Cada sub-agente lanzado equivale a **1 premium request** (o llamada API equivalente, según la plataforma). Arranca con un contexto completamente fresco: recibe las instrucciones del orquestador, las reglas compactas de skills relevantes y las rutas a artefactos que necesita leer. Ejecuta su tarea y devuelve el resultado.

### Fórmula de costo total

```
Costo total = tokens del orquestador + (1 request × N sub-agentes lanzados)
```

El orquestador no lanza trabajo en paralelo automáticamente salvo en casos explícitos como Judgment Day (donde se lanzan 2 jueces simultáneos).

---

## Costo por Tipo de Operación

| Operación                                                | Premium Requests  | Modelo   | Costo relativo   |
| -------------------------------------------------------- | ----------------- | -------- | ---------------- |
| **Delegación directa** (bug, refactor puntual, pregunta) | **1**             | sonnet   | 💰💰               |
| Conversación con orquestador                             | 1 continua        | opus     | 💰💰💰              |
| `/sdd-init`                                              | 1                 | sonnet   | 💰💰               |
| `/sdd-explore`                                           | 1                 | sonnet   | 💰💰               |
| `/sdd-propose`                                           | 1                 | opus     | 💰💰💰              |
| `/sdd-spec`                                              | 1                 | sonnet   | 💰💰               |
| `/sdd-design`                                            | 1                 | opus     | 💰💰💰              |
| `/sdd-tasks`                                             | 1                 | sonnet   | 💰💰               |
| `/sdd-apply` (por batch)                                 | 1                 | sonnet   | 💰💰               |
| `/sdd-verify`                                            | 1                 | sonnet   | 💰💰               |
| `/sdd-archive`                                           | 1                 | haiku    | 💰                |

**Leyenda de costo:**
- 💰 = Bajo (modelos rápidos/ligeros)
- 💰💰 = Medio (modelos estándar)
- 💰💰💰 = Alto (modelos de alta capacidad)

---

## Ciclo SDD Típico

Un ciclo SDD completo para un feature de tamaño medio consume aproximadamente **11 premium requests**:

```
init + explore + propose + spec + design + tasks + apply×3 + verify = ~11 requests
```

### Desglose

| Fase               | Requests   | Notas                             |
| ------------------ | ---------- | --------------------------------- |
| init               | 1          | Solo la primera vez por proyecto  |
| explore            | 1          | Omitible si ya conoces el cambio  |
| propose            | 1          | Decisión arquitectónica           |
| spec               | 1          | Especificaciones formales         |
| design             | 1          | Diseño técnico                    |
| tasks              | 1          | Desglose de tareas                |
| apply (×3 batches) | 3          | Features medios: 3 batches típico |
| verify             | 1          | Validación final                  |
| **Total**          | **~11**    |                                   |

### Variaciones

- **Si se omite explore**: ~10 requests. Útil cuando el cambio es claro.
- **Features simples**: 1-2 batches de apply → 8-9 requests.
- **Features complejos**: 4-5 batches de apply → 12-13 requests.
- **Si verify falla**: +1 apply + 1 verify = +2 requests por corrección.
- **Rango realista**: entre **10 y 15 premium requests** según tamaño y correcciones.

### Meta-comandos y su costo

Los meta-comandos son atajos que descomponen en fases individuales. No tienen costo adicional.

| Meta-comando        | Fases que lanza                 | Requests   |
| ------------------- | ------------------------------- | ---------- |
| `/sdd-new <cambio>` | explore + propose               | 2          |
| `/sdd-ff <cambio>`  | propose + spec + design + tasks | 4          |
| `/sdd-continue`     | siguiente fase pendiente        | 1          |

`/sdd-ff` es especialmente eficiente: ejecuta cuatro fases en secuencia con mínima intervención del orquestador, reduciendo el overhead conversacional.

---

## Judgment Day

Judgment Day es el protocolo de revisión adversarial paralela. Lanza dos agentes jueces de forma simultánea, sintetiza hallazgos, aplica correcciones y re-juzga.

| Operación                   | Requests   |
| --------------------------- | ---------- |
| Round 1: 2 jueces paralelos | 2          |
| Fix agent (correcciones)    | 1          |
| Round 2: 2 re-jueces        | 2          |
| **Total por ciclo**         | **3–5**    |
| Si escala a 2 iteraciones   | 8–10       |

Judgment Day tiene un costo mayor que una verificación simple, pero está diseñado para cambios de alto impacto donde la calidad justifica la revisión exhaustiva. Se recomienda para:

- Cambios que afectan a múltiples módulos.
- Código de seguridad o autenticación.
- Antes de merges a producción en cambios críticos.
- Refactors que tocan infraestructura compartida.

No es necesario en cada ciclo SDD; reservar para cambios donde un bug sería costoso.

---

## Presupuestos de Artefactos

Conductor impone límites de palabras compactos para cada artefacto. Esto no es arbitrario: los artefactos son leídos por fases downstream, y artefactos más cortos significan **menos tokens de contexto** en cada request posterior.

| Artefacto     | Presupuesto    | Justificación                                    |
| ------------- | -------------- | ------------------------------------------------ |
| `proposal.md` | < 400 palabras | Herramienta de pensamiento, no documentación     |
| `spec.md`     | < 650 palabras | Scenarios de 3-5 líneas; la spec no es un manual |
| `design.md`   | < 800 palabras | Tablas y diagramas sobre prosa extensa           |
| `tasks.md`    | < 530 palabras | Checklist con 1-2 líneas por tarea               |

### Impacto en tokens downstream

```
spec.md de 2.000 palabras → ~2.700 tokens leídos por apply, verify, archive
spec.md de   600 palabras → ~  800 tokens leídos por apply, verify, archive
                            ─────────────────────────────────────
                            Ahorro: ~1.900 tokens × 5+ fases = ~9.500 tokens
```

Un artefacto inflado se paga en cada fase que lo lee aguas abajo. Mantener artefactos dentro del presupuesto es una de las optimizaciones más efectivas.

---

## Overhead de Skill Injection

Cuando el orquestador lanza un sub-agente, inyecta en el prompt las reglas compactas de los skills relevantes.

| Concepto                      | Valor típico        |
| ----------------------------- | ------------------- |
| Tokens por skill inyectado    | 50–150 tokens       |
| Skills típicos por delegación | 3–5                 |
| Overhead total por sub-agente | 400–600 tokens      |
| Contexto del código base      | 5.000–50.000 tokens |

El overhead de skills es **insignificante** comparado con el contexto del código. Pero es una inversión con retorno: 400-600 tokens de reglas evitan que el sub-agente tome decisiones inconsistentes, lo que de otro modo generaría ciclos de corrección mucho más costosos.

---

## Carga Condicional TDD

Los módulos de testing estricto (`strict-tdd.md` y `strict-tdd-verify.md`) están diseñados con carga condicional:

| Módulo                 | Tamaño      | Consumo cuando inactivo  |
| ---------------------- | ----------- | ------------------------ |
| `strict-tdd.md`        | ~280 líneas | **0 tokens**             |
| `strict-tdd-verify.md` | ~260 líneas | **0 tokens**             |

Solo se cargan cuando:
1. `strict_tdd: true` está configurado en el proyecto, **Y**
2. Existe un test runner reconocido.

Proyectos que no usan TDD estricto **no pagan el costo** de ese contexto adicional. Es consumo cero real, no reducido.

---

## Estrategias de Optimización

### 1. Usa `/sdd-ff` para batching de planificación

En lugar de ejecutar propose, spec, design y tasks como cuatro pasos separados —con cuatro turnos del orquestador y overhead intermedio— usa `/sdd-ff` para lanzarlos en secuencia. Mismas fases, menor overhead conversacional.

```
❌ Costoso: /sdd-propose → revisar → /sdd-continue → revisar → /sdd-continue → revisar → /sdd-continue
✅ Eficiente: /sdd-ff mi-cambio
```

### 2. Omite explore si ya sabes qué construir

`/sdd-explore` investiga código desconocido y clarifica requisitos. Si ya tienes claro el cambio, salta directo a `/sdd-propose` o `/sdd-ff`. Ahorras 1 premium request sin perder calidad.

### 3. Usa `/sdd-continue` para control granular

Si prefieres revisar cada artefacto antes de avanzar, `/sdd-continue` ejecuta solo la siguiente fase pendiente. Más turnos de orquestador pero visibilidad total.

### 4. Ajusta los tamaños de batch en apply

- **Batches pequeños** (2-3 tareas): más requests pero mejor recuperación ante errores.
- **Batches grandes** (5-8 tareas): menos requests pero mayor costo de rehacerlo si falla.
- **Recomendación**: batches pequeños para features de alta incertidumbre; grandes para cambios mecánicos.

### 5. No re-ejecutes verify sin cambios

Verify corre tests, build y cobertura. Re-ejecutar sin haber cambiado código es un gasto directo sin valor. Solo verificar después de cambios reales.

### 6. Usa modelos rápidos para tareas mecánicas

Archive usa haiku por diseño porque es una operación mecánica. Si tienes skills personalizados para tareas mecánicas (copiar, formatear, migrar), asígnales modelos rápidos.

### 7. Delegación general para tareas pequeñas

Para tareas que no justifican el ciclo SDD completo —bugfixes simples, refactors puntuales, preguntas de código— el orquestador delega directamente a un sub-agente general. Costo: **1 premium request** con modelo estándar (sonnet).

---

## Comparación con Trabajo Manual

¿Cuántos requests costaría hacer el mismo trabajo sin la estructura SDD?

### Escenario: Feature de tamaño medio

| Enfoque                   | Requests estimados  | Calidad       |
| ------------------------- | ------------------- | ------------- |
| **Manual sin estructura** | 15-25               | ⚠️ Variable   |
| **SDD estructurado**      | 10-15               | ✅ Consistente |

### Por qué SDD puede ser más económico

1. **Sin re-trabajo**: Las specs formales reducen malentendidos que generan ciclos de corrección costosos.
2. **Artefactos compactos**: Los presupuestos de palabras limitan el contexto acumulado.
3. **Delegación precisa**: Cada sub-agente recibe exactamente lo que necesita, sin contexto sobrante.
4. **Recuperación**: Si algo falla, `state.yaml` permite retomar sin repetir fases completadas.

### Escenario: Trabajo manual sin SDD

```
Chat con IA: "hazme un módulo de auth"
  → El agente lee todo el codebase (muchos tokens)
  → Implementa sin spec → errores de requisitos
  → Corrección 1: +1 request + re-lectura de contexto
  → Corrección 2: +1 request + contexto aún mayor
  → Corrección 3: conversación compactada, pierde contexto
  → Re-explicar todo: +2 requests
  Total: ~20 requests, calidad inconsistente
```

```
SDD estructurado:
  → /sdd-ff auth-module (4 requests: plan completo)
  → /sdd-apply (3 batches: implementación guiada por spec)
  → /sdd-verify (1 request: validación formal)
  Total: ~10 requests, calidad consistente
```

---

## Impacto del Modelo

La elección de modelo es el factor de mayor impacto en el costo por request.

### Comparación por nivel

| Nivel    | Modelo   | Costo relativo   | Calidad                            | Uso en Conductor                    |
| -------- | -------- | ---------------- | ---------------------------------- | ----------------------------------- |
| Alto     | opus     | 💰💰💰              | Excelente en arquitectura y juicio | Orquestador, propose, design        |
| Estándar | sonnet   | 💰💰               | Óptimo para ejecución y análisis   | explore, spec, tasks, apply, verify |
| Rápido   | haiku    | 💰                | Suficiente para mecánica           | archive                             |

### Si no tienes acceso a opus

El orquestador sustituye automáticamente por sonnet. Esto reduce el costo de las fases opus pero implica:

- Propuestas y diseños correctos pero con menor profundidad en trade-offs.
- El sistema sigue siendo funcional.
- Recomendado para proyectos donde la velocidad importa más que la profundidad arquitectónica.

### Costo relativo por ciclo SDD

```
Con opus disponible:
  Orquestador (opus) + 2 fases opus + 6 fases sonnet + 1 fase haiku
  Costo relativo: ████████████████░░░░ (alto)

Sin opus (todo sonnet):
  Orquestador (sonnet) + 8 fases sonnet + 1 fase haiku
  Costo relativo: ████████████░░░░░░░░ (medio)

Solo haiku (no recomendado):
  Costo relativo: ████░░░░░░░░░░░░░░░░ (bajo, calidad insuficiente)
```

---

## Resumen de Costos

| Flujo                    | Requests   | Modelos             | Cuándo usarlo              |
| ------------------------ | ---------- | ------------------- | -------------------------- |
| Delegación simple        | 1          | sonnet              | Tareas pequeñas, preguntas |
| `/sdd-new`               | 2          | sonnet + opus       | Iniciar un cambio nuevo    |
| `/sdd-ff`                | 4          | opus + sonnet×3     | Planificación rápida       |
| Ciclo SDD completo       | 10-15      | mixto               | Features medianos          |
| Judgment Day             | 3-5        | sonnet×2-4 + sonnet | Revisión crítica           |
| Ciclo SDD + Judgment Day | 13-20      | mixto               | Features críticos          |

---

[← Anterior: OpenSpec](./09-openspec-y-persistencia.md) | [Volver al README](../README.md) | [Siguiente: Crear Skills →](./11-crear-skills-personalizados.md)
