# conductor

**Spec-Driven Development verificado: un driver determinista conduce a la IA fase a fase, y un gate sin LLM comprueba que lo construido cumple lo especificado — antes de dar nada por hecho.**

**Versión** 2.0.0 · Node ≥ 20 · 0 dependencias · instalación única por npm

---

## ¿Qué es?

conductor convierte "pedirle código a la IA" en un **proceso de ingeniería auditable**: primero la spec, luego el código contra ella, y al final un **gate determinista** (código, no un modelo) verifica coherencia spec ↔ código ↔ tests. Si no cumple, no hay GREEN — da igual lo convincente que suene el modelo.

| Sin conductor | Con conductor |
|---|---|
| La IA genera código al vuelo | **Spec primero**; el código se implementa contra ella |
| "Hecho" = "el modelo dice que está hecho" | **Gate sin LLM** verifica coherencia y trazabilidad requisito→código→test; sin NINGÚN test = **aviso visible** (y **bloquea** en presets estrictos). Un test sin etiqueta que ejercita el código **cuenta** (cobertura por referencia) |
| Un modelo flojo se salta pasos | La secuencia la garantiza **código**: con cualquier modelo, las fases van en orden o no avanzan |
| Un solo modelo para todo | **Modelo por FASE**, mezclando proveedores en el mismo run: planifica barato con tu proxy, codea con tu licencia premium |
| El consumo es una caja negra | **Tokens y coste por fase**, estimación ANTES de lanzar (sin gastar API) y precisión del estimador medida |
| Sin evidencia | Cada GREEN queda **sellado (Ed25519)**, encadenado a un **ledger** y con **informe AI Act** (modelos, aprobaciones humanas con hash de lo aprobado, verificación) |

**Tú mandas**: el pipeline pausa para tu revisión, y en cada pausa puedes editar la spec, dar instrucciones, cambiar el modelo en caliente, rehacer una fase o parar. Nada de piloto automático.

---

## Instalación (una vez por máquina)

Requisitos: **Node ≥ 20**, git, y la CLI de GitHub Copilot (`copilot`) con licencia activa. Opcional: acceso a tu proxy LiteLLM corporativo (modelos a 0 créditos premium).

```bash
# 1. Instalar
npm i -g "git+<url-del-repo>#<rama-o-tag>"

# 2. Comprobar
conductor version          # → conductor 2.0.0

# 3. Conectar tus CLIs de chat (menú interactivo; Enter = los detectados)
conductor setup
```

`setup` conecta el comando **`/conductor`** y el servidor MCP en los CLIs que tengas (Copilot, Claude Code, OpenCode) y deja creada la **plantilla de credenciales**.

### Credenciales del proxy (opcional, recomendado)

Abre `~/.conductor/litellm.json` — la plantilla te enseña el formato:

```json
{
  "baseUrl": "https://tu-proxy/v1",
  "apiKey": "sk-…",
  "models": {
    "mi-modelo": { "name": "Mi Modelo", "limit": { "context": 128000, "output": 16384 } }
  }
}
```

- Los `models` que declares salen **siempre** en el selector, con su nombre y sus límites.
- **También puedes pegar tu bloque de proveedor de OpenCode tal cual** (con `options.baseURL`, timeouts…) — conductor lo entiende.
- La key **se queda como tú la escribas** (mismo hábito que tu `opencode.json`). ¿Prefieres cifrarla? Añade `"seal": true` (AES-256-GCM) o usa `conductor litellm login`. En cualquier caso jamás viaja por HTTP ni la ve un modelo, y `conductor litellm status` te enseña su huella (últimos 4 + sha corto) para que SIEMPRE sepas cuál hay dentro.

---

## Por proyecto (una vez por repo)

```bash
cd tu-proyecto
conductor init
```

`init` **detecta tu repo** (determinista, 0 tokens) y te lo enseña: versiones exactas, gestor de paquetes, proyectos del workspace y los **comandos reales** de build/test/lint — que quedan **ya sembrados como `checks`** en conductor.json (la fase test los ejecuta). Crea el árbol **OpenSpec** completo:

```
openspec/
├── project.md            ← CONTEXTO (con el bloque «detectado» que cada init refresca; el resto es tuyo)
├── conductor.json        gobierno del equipo — nace con TUS checks detectados; todo lo demás es opcional
├── config.yaml           marcador del estándar OpenSpec (el CLI oficial reconoce el repo)
├── specs/                fuente de verdad VIVA (la llena el ciclo al archivar)
└── changes/  + archive/  cambios activos e histórico
```

Si el repo ya tiene **AGENTS.md / copilot-instructions**, init lo detecta y el project.md los **referencia** en vez de repetirlos (cero duplicidad: cada dato, una casa). Para el relleno semántico leyendo tu repo con IA: `conductor init-config . --smart`. `init` también ofrece (mini-menú) el comando `/conductor` **por-proyecto** para cada CLI — ficheros committeables: al clonar el repo, todo tu equipo lo hereda.

---

## Uso diario — dos vías, mismo motor

### 🌐 La miniweb (el cockpit)

```bash
conductor        # «▶ arrancando conductor v2.0.0 …» → http://127.0.0.1:4750
```

1. **Describe la feature** en el formulario (`@fichero` para dar contexto, `/skill` para patrones de equipo, arrastra capturas).
2. Revisa el **plan**: preset propuesto, fases, y la **estimación de tokens sin gastar API**.
3. Elige **modelo por fase** si quieres mezcla — y 💾 para guardarla como default del equipo.
4. **Lanza** y decide en cada pausa: 📄 artefactos (✏️ editables) · **± vs spec viva** (diff del delta contra la spec promovida) · 📣 nota para la fase · 🎛 modelo en caliente · ↺ rehacer · ✓ aprobar · ■ detener.
5. Si el gate encuentra fallos: eliges cuáles van al **fix dirigido** y se re-verifica.
6. En GREEN: 📋 descripción de PR · 📊 informe · 🛡 AI Act · 📃 sesión completa del agente · ⬆ **Archivar** (promueve las specs a la fuente de verdad).

La app es única y local (127.0.0.1, solo tú), instalable como PWA, se apaga sola tras 120 min sin uso (`conductor stop` para pararla ya) y **jamás finge**: si el servidor no está, lo dice.

### 💬 El chat (sin salir de tu CLI)

```
/conductor añade un endpoint de salud con sus tests   ← pipeline con pausas EN el chat
/conductor                                            ← estado y ayuda, sin abrir navegador
```

Las pausas te llegan como conversación **legible**: el motor construye la presentación (fase, progreso, decisiones previas, hallazgos y la spec en titulares — jamás el muro GIVEN/WHEN/THEN) y el chat la imprime tal cual. Web y chat se coordinan: si apruebas en la web, cualquier mensaje tuyo re-engancha el chat con lo decidido, y una aprobación tardía **jamás** cae en una pausa que no viste. En VS Code, la primera vez el chat pedirá permiso por cada tool: elige **«Always allow»**. Para procesos/CI existe además el modo job: la tool MCP `conductor_drive {async:true}` lanza y devuelve el identificador al instante.

---

## Modelos y coste

- Prefijos: `litellm:<modelo>` (tu proxy, **0 créditos premium**) · `copilot:<modelo>` (catálogo real de tu licencia) · sin prefijo = el de la sesión.
- **Catálogo 100% vivo**: la lista de Copilot sale del SDK del CLI auto-actualizado — TODOS los modelos de TU licencia, con su nombre oficial, ventana de contexto y **categoría de AI credits** (la misma del picker oficial). Si mañana cambian los modelos, la lista cambia sola.
- **Mezcla libre en el mismo run**: cada fase con su modelo. La fase gana al rol (`models.spec` > `models.planner`) — en la web, «Por fase (avanzado)». Regla práctica: `spec` y `verify` con el más capaz (un error de spec se propaga a todo; verify decide el GREEN), `explore`/`tasks` con el económico, `apply` en el medio con `fallback`.
- **`fallback` (opt-in)**: modelo de reserva por rol/fase — si el primario falla por timeout/proveedor, UN intento extra con la reserva, registrado con total transparencia (timeline, AI Act, badge 🛟).
- **Frenos reales**: `budget` (techo duro de tokens/coste por run) · `tiers` (economy/balanced/premium — el tier de cada modelo Copilot sale de su categoría de precio REAL, no de una tabla) · timeout y reintentos acotados por fase.
- **Verificable**: `conductor stats` muestra consumo real por proveedor/modelo, el ahorro, la **precisión del estimador** (estimado vs real medido) y un corte **POR DÍA** (día × modelo × proveedor: peticiones y tokens) — cruzable 1:1 con el informe de consumo de tu organización: allí ves el €, aquí en qué se fue.

```json
// openspec/conductor.json — ejemplo mínimo (TODO es opcional)
{
  "models": { "planner": "litellm:mi-modelo-barato", "coder": "copilot:claude-sonnet-4.5" },
  "preset": "feature",
  "fallback": { "coder": "copilot:claude-haiku-4.5" }
}
```

Presets (el dial de gobierno): `quick-fix` · `visual` (laxos: un typo no exige test nuevo) · `feature` (default: trazabilidad estricta) · `migration` (además: clarify obligatorio, spec congelada, gate de datos SQL). `verify` está SIEMPRE — es innegociable. Y las **lentes de review van por riesgo**: quick-fix/visual pasan 1 lente, feature 3, migración 4 — un typo no paga tres revisores.

---

## Por qué fiarte (calidad y seguridad)

- **Gate determinista sin LLM**: coherencia, estructura, trazabilidad, tests que verifican de verdad (caza tests "huecos"), secretos hardcodeados, SQL destructivo, breaking-changes de contrato. No obedece prompts: o cumple, o FAIL.
- **El propio harness se auto-certifica**: un golden-set de 12 escenarios (`conductor evals`, offline, 0 tokens) ejercita cada gate e invariante con su resultado esperado; el pass-rate queda **versionado en git**, y cambiar un prompt del pipeline **exige** re-certificar en verde.
- **Provenance**: sello Ed25519 por GREEN **atado al árbol git exacto** del working tree («verificado» = ESTE código, no la fe) + ledger hash-encadenado (manipular una entrada rompe la cadena) + `conductor upgrade` que reinstala de tu origen y **verifica el motor nuevo** antes de dártelo por bueno.
- **Agentes con correa corta**: sin git, sin red, sin comandos destructivos; toolset mínimo por rol; el contenido del repo se trata como **datos**, no como instrucciones; ejecutar los tests del proyecto requiere TU consentimiento explícito.
- **AI Act**: el acta de «quién hizo qué» por cambio (modelo y **papel** de cada agente por fase, aprobaciones humanas **con hash de lo aprobado**, verificación, sello) — la evidencia que exige la UE desde el 2-ago-2026, como subproducto gratis del pipeline. **No es el sello de calidad** (eso es GREEN, el veredicto SDD): es la respuesta preparada si un cliente o auditoría pregunta por la IA. Cuándo aplica y cuándo no: en la Ayuda del panel.

---

## Comandos de referencia

| Diario | |
|---|---|
| `conductor` | abre la miniweb en este repo (la arranca si está apagada) |
| `conductor init` | inicializa el proyecto (una vez por repo) |
| `/conductor <petición>` | el pipeline en el chat de tu CLI |
| `conductor stats` | consumo real, ahorro y precisión del estimador |
| `conductor doctor` | autotest del entorno (credenciales, prompts, hosts, app) |
| `conductor receipt <change>` | descripción de PR del run verificado |

| Cuando lo necesites | |
|---|---|
| `conductor setup` | (re)conectar CLIs y regenerar la plantilla de credenciales |
| `conductor init-config . --smart` | relleno semántico de project.md/checks/rules leyendo TU repo (un one-shot de agente) |
| `conductor litellm status` | estado de tus credenciales del proxy |
| `conductor evals` | golden-set del harness (offline, 0 tokens) |
| `conductor upgrade` | actualizar desde tu origen + verificación del motor nuevo |
| `conductor stop` / `restart` | ciclo de vida de la app (se niega a parar con runs vivos) |
| `conductor help --all` | la sala de máquinas completa (gates, sellos, ledger, CI…) |

---

## ¿Algo no va?

1. `conductor doctor` — te dice qué falta y cómo arreglarlo (credenciales, hosts, proxy corporativo, bundle).
2. `http://127.0.0.1:4750/demo` — un run de muestra completo sin gastar un token.
3. La pantalla «conductor está apagado» no es un error: es la app siendo honesta; arráncala con `conductor`.
4. Credenciales: el panel muestra el MOTIVO exacto (plantilla sin rellenar, key rechazada por el proxy…) — nunca inventa modelos.
5. Log de arranque: `.conductor/launcher.log` en tu proyecto.

---

## Requisitos

- **Node.js ≥ 20** y git.
- **GitHub Copilot CLI** con licencia activa (el ejecutor de las fases). Los CLIs de chat (Copilot, Claude Code, OpenCode) son vías opcionales al mismo motor.
- Opcional: key de tu proxy LiteLLM (modelos a 0 créditos premium) · `gh` CLI para ver tus AI Credits en la web.
