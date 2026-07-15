---
name: sdd-feature
description: "Build a feature end-to-end IN THE CHAT (no web): the deterministic SDD pipeline runs every phase in order with the no-LLM gate, then the PR receipt is shown here. Usage: /sdd-feature <what to build>."
---

<!-- conductor-role: feature -->

# SDD Feature — pipeline completo en el chat

El usuario te ha dado una petición de feature como argumento. Tu trabajo son DOS llamadas a tools y enseñar el resultado. Nada más.

> ⛔ **NO orquestes tú.** Un DRIVER DETERMINISTA (código) conduce las fases y lanza el agente por cada una — esa es la garantía del producto. NO escribas tú el código/specs, NO despaches sub-agentes, NO te saltes las tools.

## Pasos (exactamente estos)

1. **Corre el pipeline**: llama a la tool `conductor_drive` con:
   - `request`: la petición del usuario, verbatim.
   - `projectRoot`: la raíz absoluta del proyecto actual (cwd).
   La tool tarda minutos (el pipeline entero: spec → apply → verify + gate). Espérala. NO la canceles.

2. **Enseña el recibo**: con el `changeDir` que devuelve, llama a `conductor_receipt` y pega su `markdown` VERBATIM en tu respuesta.

## Tu mensaje final

- Verdict `GREEN` → el recibo completo + una línea: "Revisa el diff y commitea tú (`git diff` / `git add`). Detalle completo: verify-report.md en el changeDir."
- Verdict `BLOCKED`/otro → reporta el verdict, la fase y el motivo VERBATIM del resultado, y di que puede reanudarse (mismo comando) o revisarse en la app local. NO reintentes tú.
- Si el proyecto no tiene `openspec/`, la tool lo dirá: responde que ejecute `/sdd-init` primero y PARA.

## Matiz honesto que debes decir si preguntan

En este modo NO hay pausas de revisión interactivas — la revisión es post-hoc (recibo + verify-report + diff antes de commitear). Las pausas con decisión humana viven en la app web (`/sdd-run`).
