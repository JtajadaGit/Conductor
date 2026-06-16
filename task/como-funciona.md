# Cómo funciona conductor — y cómo se usará cuando terminemos

> Doc para Jorge (mantenedor). La idea central: **toda la complejidad está por debajo; usarlo es simple.**
> Actualizado: 2026-06-10 (tras validar el driver Path X con qwen real → GREEN).

---

## 1. Qué es (en una frase)
Un ayudante para construir software **con método** (spec → código → verificación), que vive dentro de
**GitHub Copilot**, y que **comprueba y FIRMA solo** que lo construido es correcto.

## 2. El estado final: DOS formas de usarlo

| | **Forma A — Conversacional** | **Forma B — Automática (driver)** |
|---|---|---|
| Qué es | Chateas con los agentes en Copilot | UN comando y conductor lo construye TODO solo |
| Quién conduce | Tú (el LLM asiste) | **El código de conductor** (anti-salto garantizado) |
| Dónde | Copilot CLI **y** VS Code Copilot Chat | **Terminal** (PowerShell/bash) |
| Fiabilidad | Depende del modelo (el gate valida al final) | **Garantizada con cualquier modelo** (validado con qwen) |
| Para qué | Exploración, trabajo guiado, día a día | Features completas, CI, benchmark, "hazlo y fírmalo" |

> Analogía: A = copiloto (tú conduces). B = piloto automático (él conduce, tú supervisas).
> Mismo método, mismo gate, misma provenance.

## 3. HOW TO USE — Forma B (el driver) paso a paso

### Setup (una vez)
1. **Licencia**: tu seat de **Copilot Business** (el de la empresa). Nada más que contratar.
2. **Instalar**: Node 18+ y Copilot CLI (`npm install -g @github/copilot`) — del portal de empresa.
3. **Plugin**: instalar conductor desde el repo GitLab de la empresa (una vez; el motor viaja dentro).
4. **Clave qwen (BYOK)**: crear tu API key en el panel LiteLLM de Hiberus (Virtual Keys → `{usuario}-key`).

### Cada sesión (pegar en PowerShell antes de usar)
```powershell
$env:COPILOT_PROVIDER_TYPE="openai"
$env:COPILOT_PROVIDER_BASE_URL="https://litellm.apps.hiberus.tech/"
$env:COPILOT_PROVIDER_API_KEY="sk-xxxxxx"          # tu clave LiteLLM
$env:COPILOT_MODEL="qwen36-msc1"                   # modelo por defecto
$env:COPILOT_PROVIDER_MAX_OUTPUT_TOKENS="4096"
$env:COPILOT_PROVIDER_MAX_PROMPT_TOKENS="128000"
```
> Con BYOK→qwen el gasto de créditos premium de Copilot es ≈ **0**. Sin BYOK también funciona
> (usa el modelo del catálogo GitHub = consume premium requests). Truco: guardar esto como perfil/alias.

### Construir una feature (UN comando)
```powershell
node <ruta-plugin>\assets\conductor.mjs drive `
  <proyecto>\openspec\changes\mi-feature `
  --request "añade un componente Counter con botones +/- y un test" `
  --src <proyecto> --complexity simple
```
Sale `⏳/✅` por fase → `🏁 GREEN`. Con qwen ~10-15 min (es lento, no malo).

**Opcional — modelo distinto por fase (sin servidores):**
```powershell
... --model-planner qwen36-msc1 --model-coder qwen36-msc2 --model-reviewer qwen36-msc1
```

**Si se corta** (timeout, suspensión del PC…): **relanza el MISMO comando** → reanuda donde se quedó
**sin re-pagar** las fases hechas (`▶ reanudando…`).

### Qué deja cada run (automático, sin pasos extra)
- El **código** en `src/` (lo escribe Copilot con sus herramientas nativas).
- `openspec/changes/mi-feature/`: `proposal.md`, `specs/*/spec.md`, `apply-report.md`,
  `verify-report.md`, **`provenance.json`** (sello firmado) y **`run-timeline.json`** (fase × modelo ×
  duración × tokens).
- **`openspec/provenance.ledger.jsonl`**: cada GREEN se encadena al audit trail (hash-chain).
- Opt-in `CONDUCTOR_GIT_COMMIT=1` → un commit git por fase (auditoría estilo orchestrator).

### Comandos de inspección
```powershell
node <plugin>\assets\conductor.mjs verify <change>\provenance.json        # ¿íntegro y auténtico?
node <plugin>\assets\conductor.mjs dashboard <change> --src <proyecto>   # informe HTML (gate+traza+timeline)
node <plugin>\assets\conductor.mjs ledger verify --ledger <proyecto>\openspec\provenance.ledger.jsonl
node <plugin>\eval\bench.mjs --project <proyecto> --models qwen36-msc1 --tasks E1,E3 --timeout 600  # calidad por modelo
```

## 4. HOW TO USE — Forma A (conversacional)

- **Copilot CLI**: exporta el BYOK (arriba) → `copilot` → `/sdd-init` la primera vez → pide cosas al
  orquestador. El gate corre por MCP (registrado al instalar el plugin).
- **VS Code Copilot Chat**: igual de válido; el modelo se elige en el picker de VS Code (aquí los
  agentes pueden usar arrays de fallback de modelo). `/sdd-init`, `/sdd-status`, `/sdd-archive`, `/sdd-explain`.
- Honesto: con un modelo flojo (qwen) el LLM puede desviarse del flujo en vivo; el **gate** lo detecta,
  pero **la garantía dura la da la Forma B**. Recomendación a usuarios: conversacional para explorar,
  driver para construir.

## 5. Quién hace qué

| Quién | Hace | Ve |
|---|---|---|
| **Usuario** | Instala plugin (1 vez) + su clave (1 vez) + chatea o lanza `drive` | Lo simple |
| **conductor** | Fases, gate, sello, ledger, telemetría | Nada (automático) |
| **Jorge (mantenedor)** | `git push` al repo GitLab del plugin | Solo él |

> Reglas de oro: el usuario **nunca** edita ficheros del plugin · **cero infra** (no hay servidores que
> desplegar; todo viaja en el plugin) · tech-agnóstico (da igual Angular/Java/SAP…).

## 6. Qué aporta cada mejora del plan (resumen)
- **Driver Path X** ✅ → la Forma B: garantizado con cualquier modelo (validado GREEN con qwen real).
- **Resume + ledger + commits por fase** ✅ → infalible ante cortes + auditable sin esfuerzo.
- **Modelo por fase (flags/env)** ✅ → barato sin servidores. (El proxy LiteLLM queda como opcional futuro.)
- **Anti-inyección (T1)** ✅ → los agentes tratan el repo como DATOS, no como órdenes.
- **SDK de Copilot** (futuro #24) → misma Forma B pero programática-nativa; habilitaría una web tipo
  orchestrator. No bloquea nada.

## 7. El resumen en una frase
conductor termina siendo: **"pide una feature en una frase → se construye con método, sin saltarse
pasos, con cualquier modelo (incluido el gratis), y queda verificada, contabilizada y FIRMADA"** — y
tú solo mantienes un repo en GitLab.
