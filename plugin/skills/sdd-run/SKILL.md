---
name: sdd-run
description: "Open the conductor app (local web cockpit) to run the Spec-Driven Development pipeline. A deterministic driver runs every phase in order with a no-LLM gate — phases cannot be skipped, regardless of model. Use this to launch conductor; features are started from the panel."
---

<!-- conductor-role: run -->

# SDD Run

Your ENTIRE job: **start the conductor app and open its dashboard.** The SDD pipeline runs inside the app (local web at `http://127.0.0.1:4750`), and the user launches each feature **from the panel** (types the request, picks complexity/model, clicks "Lanzar run"). One command + one short message.

> ⛔ **NO orquestes tú.** Un DRIVER DETERMINISTA (código) conduce las fases y lanza el agente por cada una — esa es la garantía del producto. NO hagas la tarea tú, NO escribas código/specs, NO despaches sub-agentes, NO uses el agente `sdd-orchestrator` (ya no existe como agente del plugin). Tu único trabajo es abrir la app.

## Cómo
Ejecuta `run.mjs` desde el directorio base de esta skill, con Node, **solo con `--project`**:
- `--project "<ruta absoluta del proyecto>"` (REQUIRED)

```
node <skill>/run.mjs --project "<abs project root>"
```

Levanta la app si no está viva (proceso detached; su salida va a `.conductor/launcher.log`) y **abre el dashboard**. Imprime la URL y `✅ LAUNCHED`. Termina en segundos.

## Tu mensaje, y tarea completa
Di al usuario, en una línea: la URL del dashboard (verbatim del output) + "escribe ahí la feature y pulsa **Lanzar run** — complejidad, modelo por fase, pausas de revisión, aprobaciones, resultado e informes viven todos en el panel". Marca la tarea COMPLETE y PARA.
- NO esperes al pipeline, NO hagas polling, NO leas ficheros producidos, NO ejecutes tests, NO llames a tools MCP de conductor, NO relances.
- `✅ LAUNCHED` / exit 0 = éxito. Cualquier otra cosa: reporta el texto de error verbatim y para (sin reintentos).
- Si el agente anfitrión (Copilot CLI) no está disponible, dilo y para.
