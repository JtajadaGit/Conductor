# Integraciones opcionales (avanzado)

> **El camino normal es el plugin de Copilot** (ver README). Esta página existe para los demás casos:
> instalación por npm, otros hosts de agentes vía MCP, y terminal puro. Todo lo de aquí está testeado,
> pero es la excepción — si dudas, vuelve al README.

## Instalación por npm (Windows/Mac/Linux)

```bash
npm install -g git+<URL-del-repo-interno>#vX.Y.Z
```
Crea el comando global `conductor` (shims de bash, cmd y PowerShell los hace npm). Actualizar = el mismo
comando con el tag nuevo. Desinstalar: `npm uninstall -g conductor`. Cero dependencias, cero `node_modules`.

Después, el onboarding guiado lo hace todo (credenciales → host → panel):
```bash
conductor install
```

## Conectar un host MCP (editor o CLI de agentes)

```bash
conductor connect --vscode                 # VS Code (mecanismo oficial del editor; fusión en .vscode/mcp.json como fallback)
conductor connect --to <config-del-host>   # cualquier host MCP: detecta el formato (servers | mcpServers | mcp-array),
                                           # fusiona SIN pisar nada tuyo, deja backup y es idempotente
```
Reinicia el host y pide en su chat: *«abre el panel de conductor en este proyecto»* (tool `conductor_app`).

- Config **portable** (tras npm): `{"command":"conductor","args":["mcp"]}` — sin rutas, sobrevive a actualizaciones.
- Snippet manual con la ruta real de TU instalación (3 formatos + deeplink one-click de VS Code): `conductor mcp-config`.
- Hosts con **comandos-markdown** (`/conductor` nativo en su chat): `conductor connect --command-dir <dir-de-comandos-del-host>`.

## Credenciales por terminal

```bash
conductor byok login
```
Key tecleada **oculta**, cifrada AES-256-GCM local (jamás en claro ni en argv). Si tu organización exige
límites del proveedor, se capturan de `COPILOT_PROVIDER_MAX_OUTPUT_TOKENS`/`MAX_PROMPT_TOKENS` (o
`--max-output`/`--max-input`) y viajan con las credenciales a todas las superficies.

## Terminal puro (sin web para decidir)

```bash
conductor                                        # abre el panel en el repo actual
conductor drive <changeDir> --request "…" --src .   # pipeline completo con pausas EN LA CONSOLA:
                                                 #   [Enter=aprobar · n=nota · m=modelo · r=rehacer fase · s=stop]
conductor receipt <changeDir>                    # recibo de PR (markdown) del run verificado
```
En Git Bash/MinTTY exporta `CONDUCTOR_TTY=1` (la detección de TTY de Windows no ve esas consolas).

## Notas de despliegue

- El paquete npm-desde-git usa el tarball del servidor (git archive): las fuentes del motor y los ficheros
  internos **no viajan** — solo bundle, UI y plugin (~230 KB + UI).
- La versión la manda `plugin.json`; `package.json` se sincroniza en cada build. Nunca versionar hacia atrás
  (el auto-relevo de la app compara versiones).
- `npx` directo contra el repo git queda descartado (re-resuelve la rama en cada invocación: minutos);
  será viable cuando el paquete esté publicado en el registro npm interno.
