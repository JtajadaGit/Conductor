# ⚖️ Judgment Day — Revisión Adversarial

[← Volver al README](../README.md) | [Ver Catálogo de Skills](./04-catalogo-skills.md)

## ¿Qué es Judgment Day?

Judgment Day es un protocolo de **revisión adversarial paralela** que lanza dos jueces de IA independientes y ciegos para revisar el mismo código simultáneamente. Ningún juez sabe del otro. Sus hallazgos se sintetizan, se aplican correcciones, y se re-evalúa hasta que ambos aprueben o se escale al usuario.

**¿Por qué dos jueces?** Un solo revisor puede tener puntos ciegos. Dos revisores independientes que encuentran el mismo problema confirman que es real. Hallazgos de solo un juez requieren triaje.

**¿Por qué ciegos?** Si un juez conociera los hallazgos del otro, se anclaría en ellos. La independencia elimina el sesgo de confirmación.

---

## Triggers

Judgment Day se activa con cualquiera de estas frases:

| Idioma | Triggers |
|--------|----------|
| Inglés | `judgment day`, `judgment-day`, `review adversarial`, `dual review` |
| Español | `juzgar`, `que lo juzguen`, `doble review` |

---

## Flujo Completo

### Step 0: Skill Resolution (OBLIGATORIO)

Antes de lanzar jueces, el orquestador DEBE resolver skills del proyecto:

1. Leer `.atl/skill-registry.md` del proyecto
2. Identificar archivos/scope del target a revisar
3. Matchear skills relevantes por:
   - **Code context**: extensiones/rutas de archivos (`.tsx` → react, typescript)
   - **Task context**: "review code" → skills de framework/lenguaje
4. Construir bloque `## Project Standards (auto-resolved)` con compact rules
5. Inyectar en AMBOS prompts de jueces Y en el prompt del Fix Agent (idéntico)

> Si no existe registry: advertir al usuario y proceder con revisión genérica.

### Step 1: Lanzar Judge A + Judge B en paralelo

Ambos jueces reciben:
- El mismo target (archivos, feature, componente)
- Los mismos criterios de revisión
- Los mismos Project Standards (si fueron resueltos)
- **Ninguno sabe del otro** — revisiones completamente independientes

**Criterios de revisión estándar:**

| Criterio | Qué evalúa |
|----------|-------------|
| Correctness | ¿El código hace lo que dice? ¿Hay errores lógicos? |
| Edge cases | ¿Qué inputs o estados no se manejan? |
| Error handling | ¿Se capturan, propagan y loguean errores correctamente? |
| Performance | ¿Hay queries N+1, loops ineficientes, allocations innecesarias? |
| Security | ¿Hay riesgos de injection, secrets expuestos, auth checks faltantes? |
| Naming & conventions | ¿Sigue los patrones establecidos del proyecto? |

El usuario puede agregar criterios custom que se incluyen en ambos jueces.

### Step 2: Esperar → Sintetizar Veredictos

El orquestador (NO un sub-agente) compara los resultados:

```
                     Judge A encontró    Judge A NO encontró
                    ┌───────────────────┬─────────────────────┐
Judge B encontró    │    CONFIRMED      │    SUSPECT (B only) │
                    │  (alta confianza) │    (requiere triaje) │
                    ├───────────────────┼─────────────────────┤
Judge B NO encontró │  SUSPECT (A only) │       (no issue)     │
                    │  (requiere triaje)│                      │
                    └───────────────────┴─────────────────────┘
```

### Step 3: Clasificación

| Categoría | Significado | Acción |
|-----------|-------------|--------|
| **Confirmed** | Encontrado por AMBOS jueces | Alta confianza → corregir inmediatamente |
| **Suspect A** | Solo Judge A lo encontró | Triaje — puede ser falso positivo o punto ciego de B |
| **Suspect B** | Solo Judge B lo encontró | Triaje — puede ser falso positivo o punto ciego de A |
| **Contradiction** | Jueces DESACUERDAN sobre lo mismo | Marcar para decisión manual del usuario |

### Step 4: Fix Agent → Re-judge

```
¿Hay issues?
│
├── NO issues encontrados
│   └── JUDGMENT: APPROVED ✅
│       (parar aquí)
│
└── SÍ hay issues
    └── Delegar Fix Agent con issues confirmados
        │
        ▼
        Fix Agent aplica correcciones
        │
        ▼ ⚠️  BLOCKING: La siguiente acción DEBE ser re-lanzar jueces.
        │     NO push, NO commit, NO mensaje al usuario.
        │
        ▼
        Re-lanzar Judge A + Judge B en paralelo (Round 2)
        │
        ▼
        Sintetizar veredicto
        │
        ├── Limpio → JUDGMENT: APPROVED ✅
        │
        └── Aún hay issues → Fix Agent de nuevo (Round 3 / iteración 2)
            │
            ▼
            Re-lanzar jueces (Round 3)
            │
            ├── Limpio → JUDGMENT: APPROVED ✅
            │
            └── Aún hay issues
                └── PREGUNTAR al usuario:
                    "Issues persisten después de 2 iteraciones. ¿Continuar?"
                    │
                    ├── SÍ → repetir ciclo fix + judge (sin límite)
                    └── NO → JUDGMENT: ESCALATED ⚠️
```

---

## Reglas de Bloqueo (OBLIGATORIAS)

Estas reglas **no pueden omitirse, anularse ni depriorizarse** bajo ninguna circunstancia:

| # | Regla |
|---|-------|
| 1 | **NUNCA** declarar `JUDGMENT: APPROVED` hasta que ambos jueces de Round 2 retornen CLEAN |
| 2 | **NUNCA** ejecutar `git push`, `git commit`, ni ninguna acción que modifique código después de fixes hasta que re-judgment se complete |
| 3 | **NUNCA** guardar resumen de sesión ni decir "listo" al usuario hasta que cada JD alcance estado terminal (APPROVED o ESCALATED) |
| 4 | Después de que el Fix Agent retorne, la **INMEDIATA** siguiente acción es lanzar jueces Round 2 en paralelo. Ninguna otra acción puede ir primero |
| 5 | Si hay múltiples JDs en paralelo, cada uno es **independiente**. Que uno complete NO permite saltear rounds en otro |

### Self-Check (antes de CUALQUIER acción terminal)

Antes de push, commit, resumen, o decirle "listo" al usuario:

1. Listar cada target JD activo
2. Para cada uno: ¿está en estado APPROVED o ESCALATED?
3. Si algún JD tuvo fixes aplicados, ¿se ejecutó Round 2?
4. Si Round 2 encontró issues, ¿se preguntó al usuario si continuar?

**Si CUALQUIER respuesta es "no"** → se omitió un paso. Volver atrás y completarlo.

---

## Formato de Salida

### Veredicto (cada round)

```markdown
## Judgment Day — {target}

### Round {N} — Veredicto

| Hallazgo | Judge A | Judge B | Severidad | Status |
|----------|---------|---------|-----------|--------|
| Null check faltante en auth.go:42 | ✅ | ✅ | CRITICAL | Confirmed |
| Race condition en worker.go:88 | ✅ | ❌ | WARNING | Suspect (A only) |
| Naming inconsistente en handler.go:15 | ❌ | ✅ | SUGGESTION | Suspect (B only) |
| Error tragado en db.go:201 | ✅ | ✅ | CRITICAL | Confirmed |

**Issues confirmados**: 2 CRITICAL
**Issues sospechosos**: 1 WARNING, 1 SUGGESTION
**Contradicciones**: ninguna
```

### Fixes aplicados

```markdown
### Fixes Applied (Round {N})
- `auth.go:42` — Added nil check before dereferencing user pointer
- `db.go:201` — Propagated error instead of silently returning nil
```

### Resultado final: Aprobado

```markdown
### Round {N+1} — Re-judgment
- Judge A: PASS ✅ — No issues found
- Judge B: PASS ✅ — No issues found

---

### JUDGMENT: APPROVED ✅
Ambos jueces pasan limpio. El target está listo para merge.
```

### Resultado final: Escalado

```markdown
### JUDGMENT: ESCALATED ⚠️

El usuario decidió parar después de {N} iteraciones de fix. Issues persisten.
Revisión manual requerida antes de proceder.

### Issues Restantes
| Hallazgo | Judge A | Judge B | Severidad |
|----------|---------|---------|-----------|
| {descripción} | ✅ | ✅ | CRITICAL |

### Historial
- Round 1: {N} issues confirmados encontrados
- Fix 1: aplicados {lista}
- Round 2: {N} issues persisten
- Fix 2: aplicados {lista}
- Round 3: {N} issues persisten → escalado

Recomendación: revisión humana de los issues restantes antes de re-ejecutar judgment day.
```

---

## Cuándo Usar Judgment Day

| Escenario | ¿Usar JD? | Razón |
|-----------|-----------|-------|
| Pre-merge de feature importante | ✅ Sí | Última línea de defensa antes de merge |
| Cambios críticos de seguridad | ✅ Sí | El costo de un bug en producción > costo de dos reviews |
| Refactoring de infraestructura | ✅ Sí | Cambios amplios pueden tener efectos no obvios |
| Fix de typo en un README | ❌ No | Overkill para cambios triviales |
| Cambio de una línea bien entendido | ❌ No | Un solo review es suficiente |
| Exploración/prototipo | ❌ No | No es código de producción aún |

---

## Diferencia con sdd-verify

| Aspecto | sdd-verify | Judgment Day |
|---------|-----------|--------------|
| **Propósito** | Verificar que la implementación cumple las specs | Encontrar problemas que las specs no anticiparon |
| **Enfoque** | Compliance (¿se hizo lo que se dijo?) | Adversarial (¿qué puede salir mal?) |
| **Input** | Specs, design, tasks → compare vs código | Código → buscar bugs, edge cases, security |
| **Output** | Spec Compliance Matrix | Verdict table con hallazgos categorizados |
| **Ejecuta tests?** | Sí — ejecución real obligatoria | No directamente — los jueces leen e inspeccionan |
| **Corrige?** | No — solo reporta | Sí — Fix Agent corrige issues confirmados |
| **Cuántos revisores?** | Uno | Dos (paralelos, ciegos, independientes) |
| **Cuándo usarlo** | Después de `sdd-apply` (parte del flujo SDD) | Antes de merge o en momentos críticos |

**En resumen:**
- `sdd-verify` responde: *"¿Se construyó lo que se especificó?"*
- `judgment-day` responde: *"¿Lo que se construyó está bien?"*

Ambos son complementarios. Para cambios críticos, ejecutar `sdd-verify` primero (para confirmar spec compliance) y luego `judgment-day` (para revisión adversarial).

---

## Skill Resolution Feedback

Después de cada delegación que retorna resultado, verificar el campo `**Skill Resolution**` en cada respuesta de juez/fix-agent:

| Valor | Significado | Acción |
|-------|-------------|--------|
| `injected` | Skills inyectadas correctamente ✅ | Ninguna |
| `fallback-registry` | No recibió standards, cargó del registry | Re-leer registry inmediatamente |
| `fallback-path` | No recibió standards, cargó por path | Re-leer registry inmediatamente |
| `none` | Sin skills cargadas | Re-leer registry + advertir al usuario |

Este es un mecanismo de auto-corrección. **NUNCA** ignorar reportes de fallback — indican que el orquestador perdió contexto (probablemente por compactación).

---

## Idioma

| Input del usuario | Respuesta del orquestador |
|-------------------|---------------------------|
| Español | Rioplatense: "Juicio iniciado", "Los jueces están trabajando en paralelo...", "Los jueces coinciden", "Juicio terminado — Aprobado" |
| Inglés | "Judgment initiated", "Both judges are working in parallel...", "Both judges agree", "Judgment complete — Approved" |

---

[← Anterior: Modo TDD](./05-modo-tdd-estricto.md) | [Volver al README](../README.md) | [Siguiente: Sub-agentes →](./07-subagentes-y-delegacion.md)
