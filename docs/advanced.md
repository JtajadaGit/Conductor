# Avanzado — Conductor SDD

---

## 1. Consumo de Tokens

### Costo por fase

| Fase | Requests | Model tier | Costo relativo |
|------|----------|------------|----------------|
| init | 1 | fast | bajo |
| explore | 1 | standard | medio |
| propose | 1 | high-capability | alto |
| clarify | 0-1 | standard | medio (0 si auto-skip) |
| spec | 1 | standard | medio |
| design | 1 | high-capability | alto |
| tasks | 1 | standard | medio |
| apply (por batch) | 1 | standard | medio |
| verify | 1 | standard | medio |
| archive | 1 | fast | bajo |

Ciclo completo típico: **~11 premium requests** (feature mediana, 3 batches de apply).

### Presupuestos de artefactos (impactan tokens downstream)

| Artefacto | Límite | Por qué importa |
|-----------|--------|-----------------|
| proposal.md | <400 pal | Leído por spec, design, tasks |
| spec.md | <650 pal | Leído por design, tasks, apply, verify |
| design.md | <800 pal | Leído por tasks, apply |
| tasks.md | <530 pal | Leído por apply, verify |

Un spec de 2.000 pal vs 600 pal ahorra ~9.500 tokens acumulados a lo largo del pipeline.

### Estrategias de optimización

1. **`/sdd-ff`** para batching de planificación — mismas fases, menor overhead conversacional
2. **Omitir explore** si ya tienes scope + approach + constraints claros (ahorra 1 request)
3. **No re-ejecutar verify** sin haber cambiado código
4. **Delegación directa** para tareas ≤2 archivos (1 request vs 10+)
5. **Modo Auto** para sesiones donde ya tienes claro el cambio — evita roundtrips innecesarios

---

## 2. Mejores Prácticas

### Do

- **Deja que el orquestador orqueste** — no le pidas que lea código directamente; delega a sub-agentes
- **Specs antes de código** — `/sdd-ff` como mínimo para cualquier feature
- **Batches pequeños en apply** — 2-3 tareas para features complejos; fácil de rehacer si falla
- **Verify antes de archive** — siempre. Sin excepciones.
- **openspec en proyectos serios** — habilita recuperación tras compactación
- **Configura post_hook** — captura errores de build/type-check durante apply

### Don't

- **Inline execution** — pedir al orquestador que edite archivos directamente infla su contexto
- **Archive sin verify** — contamina la fuente de verdad (main specs)
- **Re-verify sin cambios** — gasto puro sin valor
- **Batches de 8-10 tareas** — si falla, hay que rehacer todo el batch
- **Forzar SDD en tareas triviales** — el Hard Stop Rule existe por algo

### Flujos comunes

```
# Feature nueva (rápido)
/sdd-ff mi-feature → /sdd-continue (apply) → /sdd-continue (verify) → /sdd-archive

# Feature con exploración
/sdd-new mi-feature → /sdd-ff mi-feature → /sdd-continue (apply) → /sdd-continue (verify) → /sdd-archive

# Cambio crítico (paso a paso, modo Interactive)
/sdd-new mi-feature → /sdd-continue (spec) → revisar → /sdd-continue (design) → revisar → ...

# Bugfix trivial (sin SDD)
"Corrige el null check en utils.ts línea 42" → delegación directa (1 request)
```

---

## 3. Troubleshooting

### Build falla tras apply exitoso

**Por qué**: apply valida que los archivos se crearon/modificaron, pero no compila salvo que haya `post_hook`.

**Solución**: configurar `post_hook` en `openspec/config.yaml`:
```yaml
x-conductor:
  hooks:
    apply:
      post_hook: "npm run build 2>&1 | tail -30"
      post_hook_on_fail: retry
```

### Sub-agente devuelve envelope vacío o inválido

1. El orquestador reintenta automáticamente una vez
2. Si falla de nuevo → escala al usuario
3. Causa común: sub-agente se quedó sin contexto en task lists grandes

### Sub-agentes ignoran convenciones tras compactación

El orquestador se auto-recupera cuando detecta `skill_resolution: none|fallback-*` en la respuesta del sub-agente — relee `openspec/conventions.md` automáticamente. Si no ocurre: di "update skills" o "reload registry".

### `state.yaml` tiene estado inconsistente

Editar manualmente `openspec/changes/{cambio}/state.yaml`, o eliminarlo — el orquestador re-derivará el estado desde los artefactos existentes en el próximo `/sdd-continue`.

### `sdd-continue` dice "No next phase"

- El cambio ya fue archivado, o
- `state.yaml` desactualizado → eliminarlo y re-ejecutar

### Ecosistema con breaking changes (ej. Next.js 15, React 19)

El modelo puede usar patrones de versiones antiguas. Soluciones:
1. Configurar `post_hook` para capturar errores temprano
2. Documentar en `openspec/lessons-learned.md` para sesiones futuras
3. Añadir context específico de versión en `openspec/principles.md`

---

## 4. Monorepos

`sdd-init` detecta stack desde la raíz. En monorepos con stacks mixtos:

```yaml
# openspec/config.yaml — describir manualmente el monorepo
context: |
  Monorepo:
  - packages/frontend: React 19, TypeScript, Vite
  - packages/backend: Go 1.22, Chi router
  - packages/shared: TypeScript, tipos compartidos
```

Al crear cambios, ser explícito sobre el paquete objetivo:
```
/sdd-new "Add user auth to packages/backend"
```

Para cambios cross-package, considera split en SDD changes separados por paquete. Limitaciones: `sdd-init` no auto-detecta workspace boundaries; `state.yaml` cubre el cambio completo, no por paquete.

---

## 5. Sin Git

Conductor funciona sin Git, con limitaciones:

| Feature | Con Git | Sin Git |
|---------|---------|---------|
| Rollback tras apply | `git checkout` | Eliminación manual de archivos |
| Diff del cambio | `git diff` | Comparar contra `design.md` file list |
| Historial | `git log` | Solo `openspec/changes/archive/` |

Recomendaciones:
1. Antes de apply: zip del directorio o nota manual del estado actual
2. Configurar `post_hook`: esencial para capturar errores sin rollback fácil
3. Usar `openspec/` como audit trail del proyecto

---

## 6. Cuándo Romper las Reglas

### Inline Fix Exception

**Sí romper cuando** el fix es ≤5 líneas en ≤2 archivos Y tienes el contexto completo del error Y es un loop iterativo error→fix→build.

**No romper para**: features, cambios arquitectónicos, cualquier cosa que requiera leer >3 archivos.

### Explore-Always Rule

**Skip explore cuando** el input tiene >100 palabras con scope + approach + constraints explícitos. El orquestador evalúa esto automáticamente.

### Spec-Before-Design Rule

**Paralelo OK cuando** el cambio es bien conocido y la propuesta es suficientemente detallada para que ambas fases trabajen independientemente.

**Secuencial crítico cuando** las specs añadirán requisitos no obvios en la propuesta (edge cases, seguridad, constraints que design debe contemplar).

### Zero-Tolerance Consistency Check

El consistency check en tasks verifica documentos entre sí, no contra la realidad. Puede pasar cuando una dependencia no existe o una API cambió. Los `pre_hook`/`post_hook` en apply capturan los problemas reales que el consistency check no detecta.

---

→ [Quick Start](./quick-start.md) | [Pipeline SDD](./sdd-pipeline.md) | [OpenSpec](./openspec.md)
