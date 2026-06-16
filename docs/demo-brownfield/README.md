# Demo brownfield — donde conductor VALE

> 5 minutos, totalmente offline, sin tokens. El caso real: un servicio legacy sin spec, una "mejora"
> que rompe a los consumidores, y el gate determinista cazándolo ANTES de que llegue a producción.
> (Las salidas de abajo son reales — puedes reproducirlas tal cual.)

`<motor>` = `node <ruta-plugin>/assets/conductor.mjs`

## Paso 1 — Radiografiar el legacy (ingeniería inversa → spec)

```bash
<motor> explain docs/demo-brownfield/src --out /tmp/draft
```
```
conductor explain · docs/demo-brownfield/src
  REQ-ORDERS-SERVICE-JS        3 endpoint(s), 0 unit(s), 1 file(s)
  → 1 capacidad(es)
```
Sin spec previa, conductor extrae las capacidades y endpoints del código y genera un **borrador de spec
OpenSpec** (spec.md + tasks.md + openapi extraído) para que el planner lo refine. Es el on-ramp de
migraciones: el legacy entra al mundo SDD en un comando.

## Paso 2 — Llega la "mejora" v2 de la API… ¿rompe a alguien?

```bash
<motor> contract docs/demo-brownfield/contracts/orders.base.json docs/demo-brownfield/contracts/orders.head.json
```
```
  BREAKING  [contract.parameter.required-added]   parámetro query "status" pasó a requerido
  BREAKING  [contract.schema.enum-narrowed]       valores de enum eliminados: ["shipped","cancelled"]
  BREAKING  [contract.schema.required-added]      propiedad ahora requerida: "customerId"
  BREAKING  [contract.schema.nullable-removed]    nullable:true retirado
  BREAKING  [contract.path.removed]               endpoint eliminado: /api/orders/{id}
  → FAIL  (6 breaking, 0 error, 0 warn, 3 info)
```
**Rojo automático.** Ningún LLM opinando: diff determinista de contratos. Con `--format sarif` esto son
anotaciones en el PR; en CI, exit≠0 = build roto. Quien "mejoró" la API se entera HOY, no en producción.

## Paso 3 — Y la migración de BD que venía con ello

```bash
<motor> contract docs/demo-brownfield/contracts/schema.base.sql docs/demo-brownfield/contracts/schema.head.sql
```
```
  BREAKING  [contract.sql.type-changed]    tipo cambiado en orders.status: varchar(16) → smallint
  BREAKING  [contract.sql.column-dropped]  columna eliminada: orders.discount_code (rompe lecturas/escrituras existentes)
  → FAIL  (2 breaking)
```
Mismo gate, otra lente (auto-detectada por extensión): `.json`=OpenAPI · `.sql`=esquema BD · `.ts`=contrato front.
(Y `migrate <dir>` lintea las migraciones: destructivas, sin rollback, bloqueantes…)

## Paso 4 — Arreglar y sellar

Corrige la v2 (restituye el endpoint, haz opcional `customerId`, mantén el enum…) → `contract` en verde →
y el cambio se construye con `/sdd-run`, que al cerrar GREEN deja `provenance.json` **firmado** y la entrada
en el **ledger** (`<motor> verify` / `ledger verify` lo demuestran ante cualquier auditor).

## Por qué esta demo importa

| Pregunta | Sin conductor | Con conductor |
|---|---|---|
| ¿Esta v2 rompe a los consumidores? | "Creo que no" (opinión) | **6 breaking listados, build roto** (hecho) |
| ¿La migración de BD es segura? | Code review humano | **2 breaking + linter de migraciones** |
| ¿Qué hace este legacy? | Leerse el código | **Spec extraída en 1 comando** |
| ¿Puedo probar que se construyó bien? | No | **Sello Ed25519 + ledger encadenado** |

Esto no compite con tu Copilot — lo **gobierna**. Y funciona igual para Angular, Java, PHP, Magento,
Salesforce o SAP: el gate no sabe de frameworks, sabe de contratos.
