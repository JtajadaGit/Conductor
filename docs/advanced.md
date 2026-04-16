# Avanzado — Conductor SDD

---

## 1. Optimización de Tokens

### Buenas prácticas
- **Specs compactos**: usa tablas sobre prosa. Un spec de 600 palabras vs 2.000 reduce la carga acumulada en fases downstream (design, tasks, apply, verify).
- **Instruction files**: mantener cada archivo por debajo de 200 palabras. La plataforma carga TODOS los que matchean `applyTo`, así que ficheros grandes multiplican tokens.
- **Delegación directa** para tareas ≤2 archivos — evita el overhead del pipeline completo.

### Estrategias de optimización

1. **Spec-light** (automático): si tu request es >50 palabras con scope claro → omite proposal y ahorra ~400 tokens
2. **`/sdd-ff`** para batching de planificación — mismas fases, menor overhead conversacional
3. **Omitir explore** si ya tienes scope + approach + constraints claros (ahorra 1 request)
4. **No re-ejecutar verify** sin haber cambiado código
5. **Delegación directa** para tareas ≤2 archivos (1 request vs 10+)
6. **Modo Auto** (`execution_mode: auto` en config.yaml) — 0 pausas, 0 roundtrips extra

---

## 2. Mejores Prácticas

### Recomendado

- **Deja que el orquestador orqueste** — no le pidas que lea código directamente; delega a sub-agentes
- **Specs antes de código** — `/sdd-ff` como mínimo para cualquier feature
- **Batches pequeños en apply** — 2-3 tareas para features complejos; fácil de rehacer si falla
- **Verify antes de archive** — siempre. Sin excepciones.
- **openspec en proyectos serios** — habilita recuperación tras compactación
- **Configura post_hook** — captura errores de build/type-check durante apply

### Evitar

- **Inline execution** — pedir al orquestador que edite archivos directamente infla su contexto
- **Archive sin verify** — contamina la fuente de verdad (main specs)
- **Re-verify sin cambios** — gasto puro sin valor
- **Batches de 8-10 tareas** — si falla, hay que rehacer todo el batch
- **Forzar SDD en tareas triviales** — el Hard Stop Rule existe por algo

### Flujos comunes

```
# Feature nueva — modo auto (config.yaml: execution_mode: auto)
/sdd-ff mi-feature → corre todo back-to-back → /sdd-archive

# Feature nueva — modo interactive (config.yaml: execution_mode: interactive)
/sdd-ff mi-feature → pausa → apply → pausa → verify → /sdd-archive

# Feature con exploración
/sdd-new mi-feature → /sdd-ff mi-feature → apply → verify → /sdd-archive

# Bugfix trivial (sin SDD)
"Corrige el null check en utils.ts línea 42" → delegación directa (1 request)
```

### Configuración del Execution Mode

Edita `openspec/config.yaml`:
```yaml
x-conductor:
  execution_mode: auto        # auto | interactive
```
- **`auto`**: 0 pausas. Solo para en errores. Ideal cuando tienes claro el cambio.
- **`interactive`**: pausa antes de apply y antes de verify. Ideal para revisar artefactos.

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

Las convenciones se cargan automáticamente desde instruction files de plataforma (`.github/instructions/`, `.claude/rules/`). Si faltan: ejecuta `/sdd-init` + `/instructions` para regenerarlos.

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

## 4. Team Conventions (`/instructions`)

En equipos multi-persona, `/instructions` genera instruction files nativos de plataforma (`.github/instructions/` + `.claude/rules/`) — un contrato compartido que todas las IAs (Claude, Copilot) en todas las máquinas del equipo cargan automáticamente.

### Qué escanea

| Fuente | Qué extrae |
|--------|------------|
| `openspec/config.yaml` | Stack del proyecto |
| `.editorconfig`, `prettier.config.*`, `eslint.config.*` | Estándares de formato y calidad |
| `tsconfig.json`, `biome.json`, `ruff.toml` | Strictness, linting |
| `openspec/principles.md` | Principios non-negotiable del equipo |
| `openspec/lessons-learned.md` | Lecciones acumuladas |
| `*/SKILL.md` (project-level only) | Custom skills del proyecto (no personales) |

### Resultado

Genera/actualiza estos instruction files (dual-write a ambas plataformas):

| Archivo | applyTo | Contenido |
|---------|---------|-----------|
| `testing` | Test patterns dinámicos | Convenciones de testing |
| `formatting` | Source patterns dinámicos | Formato, linting, strictness |
| `principles` | `**` | Principios del equipo (si existen) |
| `custom-skills` | `**` | Custom skills del proyecto |
| `project-config` | `**` | Config files detectados |

- **Commit-ready**: instruction files se versionan y revisan como cualquier otro artefacto del equipo
- Al re-ejecutar, **merge** nuevos hallazgos con adiciones manuales existentes

---

## 5. Monorepos

`sdd-init` detecta stack desde la raíz. En monorepos con stacks mixtos:

```yaml
# openspec/config.yaml — describir manualmente el monorepo
x-conductor:
  monorepo: true
  stack:
    # Stack principal o dominante
    language: "typescript"
    runtime: "node"
    version: "20.x"
    framework: "react"
    package_manager: "npm"
```

```markdown
<!-- .github/instructions/stack.instructions.md (o .claude/rules/stack.md) — describir stacks por paquete -->
## Stack
- **packages/frontend**: React 19, TypeScript, Vite
- **packages/backend**: Go 1.22, Chi router
- **packages/shared**: TypeScript, tipos compartidos
```

Al crear cambios, ser explícito sobre el paquete objetivo:
```
/sdd-new "Add user auth to packages/backend"
```

Para cambios cross-package, considera split en SDD changes separados por paquete. Limitaciones: `sdd-init` no auto-detecta workspace boundaries; `state.yaml` cubre el cambio completo, no por paquete.

---

## 6. Sin Git

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

## 7. Cuándo Romper las Reglas

### Inline Fix Exception

**Sí romper cuando** el fix es ≤5 líneas en ≤2 archivos Y tienes el contexto completo del error Y es un loop iterativo error→fix→build.

**No romper para**: features, cambios arquitectónicos, cualquier cosa que requiera leer >3 archivos.

### Explore-Always Rule

**Skip explore cuando** el input tiene >100 palabras con scope + approach + constraints explícitos. El orquestador evalúa esto automáticamente.

### Spec-Before-Design Rule

**Nunca en paralelo.** Design consume lo que spec produce (escenarios, requisitos, criterios de aceptación). Si corren en paralelo, el design se escribiría sin saber qué dice la spec → inconsistencias garantizadas.

En pipeline condensado (`PHASE: fast-forward`), el planner las genera secuencialmente dentro de una sola llamada.

### Zero-Tolerance Consistency Check

El consistency check en tasks verifica documentos entre sí, no contra la realidad. Puede pasar cuando una dependencia no existe o una API cambió. Los `pre_hook`/`post_hook` en apply capturan los problemas reales que el consistency check no detecta.

---

---

## Referencias

- [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code)
- [GitHub Copilot docs](https://docs.github.com/en/copilot)
- [OpenSpec](https://openspec.dev/)
- [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)

→ [Quick Start](./quick-start.md) | [Pipeline SDD](./sdd-pipeline.md) | [OpenSpec](./openspec.md)
