# conductor — motor de verificación SDD determinista

Un único binario Node, **cero dependencias**, que convierte la salida de un pipeline SDD en
**evidencia verificable**. Es el "espinazo ejecutable" que hace que conductor deje de ser
"archivos .md" sin tocar su naturaleza declarativa.

```
node bin/conductor.mjs <comando> ...
npm test        # 29/29
```

## Arquitectura (lib/ — todo testeable y componible)
| Módulo | Qué hace |
|---|---|
| `openapi-diff.mjs` | Motor nativo de breaking-changes OpenAPI 3.x: paths, operations, parameters, requestBody, responses, schemas de components, con resolución de `$ref` y **semántica direccional** (request vs response). ~30 reglas, severidad, JSON-pointer. |
| `jsonschema.mjs` | Validador JSON Schema (subset draft 2020-12): type/required/enum/const/combinadores/`$ref`/format/límites. Sin deps. |
| `coherence.mjs` | Gate spec↔tasks↔apply-report (deriva, "done" mentiroso). |
| `artifacts.mjs` | Validación estructural de artefactos OpenSpec. |
| `contract.mjs` | Gate de contrato multi-dominio (autodetecta): OpenAPI · **esquema SQL** · **contrato TS**. oasdiff opcional. |
| `sqldiff.mjs` | Diff de esquema de BD (tabla/columna/tipo/NOT NULL/PK) para grandes migraciones. |
| `migration.mjs` | Linter de seguridad de migraciones (destructivas/irreversibles/bloqueantes/sin rollback). |
| `tsdiff.mjs` | Diff de contrato público TypeScript (interfaces/props) para grandes desarrollos front. |
| `trace.mjs` | Trazabilidad spec→task→code→test (escaneo multi-lenguaje de `@conductor REQ-X`). |
| `cost.mjs` | Telemetría de coste por fase desde `token-usage.jsonl` + spans OTel GenAI. |
| `provenance.mjs` | Sello "green-gate" firmado (SHA-256 + HMAC) + verificación anti-tamper. |
| `explain.mjs` | Ingeniería inversa código→borrador de spec (JS/TS/Java/PHP/Py/Go/C#/Ruby): capacidades, endpoints, OpenAPI extraído. |
| `drift.mjs` | Living-spec: requisitos sin código, superficie sin trazar, drift de contrato. |
| `ledger.mjs` | Libro mayor de provenance hash-encadenado (tamper-evident). |
| `runner.mjs` | Runs con estado + resume-from-gate. |
| `report.mjs` | Reporting: human · json · **rdjson** (reviewdog) · **SARIF 2.1.0** (GitHub code scanning) · **JUnit**. |
| `dashboard.mjs` | Informe HTML agregado autocontenido. |
| `mcp.mjs` | MCP server (stdio, protocolo 2025-11-25) exponiendo todo el motor. |
| `ci.mjs` | Generador de CI (GitHub Actions / GitLab CI) para el repo del usuario. |

## Comandos
```
conductor gate <changeDir> [--src d] [--contract base head] [--format human|json|rdjson|sarif|junit] [--strict]
conductor contract <base.json> <head.json> [--format ...]
conductor trace <changeDir> --src <dir> [--html out]
conductor cost <token-usage.jsonl> [--otel out] [--json]
conductor run|resume|status <...>            # runs con estado + resume-from-gate
conductor seal <changeDir> [--src d] [--usage j] [--key k] [-o out]   # provenance firmado
conductor verify <provenance.json> [--key k]                          # anti-tamper
conductor dashboard <changeDir> --src <d> [--usage j] [-o html]
conductor ci [--gitlab] [-o path]
conductor mcp                                # arranca MCP server por stdio
conductor doctor                             # autotest entorno + valida config contra schema
conductor version | help
```

## Garantías de diseño (reglas duras de conductor)
- **Determinista, sin LLM.** Mismo input → mismo veredicto.
- **Sin red, sin comandos destructivos.** El gate solo lee artefactos y specs.
- **Cero dependencias.** Corre en cualquier stack/SO con Node ≥18. `oasdiff` es opcional (mejora, no requisito).
- **Read-only para el usuario.** Lo ejecuta; no edita el plugin. Integración en `../integration/PROPOSALS.md`.

## Endurecimiento enterprise (v0.6)
- **Provenance Ed25519** (`keygen`/`seal`/`verify`): firma asimétrica = no-repudio (la pública verifica, solo la privada firma). HMAC legacy disponible.
- **Policy central** (`policy init|validate|enforce`): gates obligatorios, modelos permitidos, override auditado.
- **Evals** (`eval/run.mjs`): scorer determinista + self-eval del método.
- **CI propio** (`.github/workflows`, `.gitlab-ci.yml`): tests + eval + anti-drift del bundle.
- **OTLP export** (`cost --otlp`): spans en formato OpenTelemetry.
- **selfcheck**: detección de drift del motor vendado (versión + sha256).
- **Robustez**: entradas malformadas no crashean; `docs/threat-model.md`, `docs/limitaciones.md`.

## Cobertura de tests (`npm test`, 67 casos)
- `openapi-diff`: 11 categorías de breaking, compatible=0, identidad, $ref, nullable, enum, **security**, **discriminator**, **oneOf**.
- `jsonschema`: 11 casos (tipos, required, combinadores, $ref, format, nullable).
- `engine`: coherence, trace (incl. **cross-stack** Java/PHP/Apex/Spartacus/Magento), cost (51% / $0 / OTel), provenance (seal/verify/tamper), reporting (rdjson/sarif/junit).
- `explain-drift-ledger`: explain multi-stack + OpenAPI extraído, drift (requisito sin código / superficie sin trazar), ledger (cadena hash + detección de manipulación).
- `mcp`: handshake real + tools/list (9 tools) + tools/call sobre el gate + errores JSON-RPC.
