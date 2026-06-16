# Guion del congreso — "El verde que no miente" (20 min)

> Pieza central: la demo brownfield (docs/demo-brownfield/ — reproducida y verificada). Regla de oro del
> guion: NO abrir con "hacemos specs" ni "multi-agente" (table stakes 2026). Abrir con la herida.

## 0b. NUEVA APERTURA (v3 — la fecha) (1 min)
**"El 2 de agosto de 2026 — en unas semanas — entra en vigor la obligación de transparencia del EU AI
Act para contenido generado por IA. ¿Quién de aquí puede decir, HOY, qué archivos de su repo escribió
una IA, con qué modelo, quién lo aprobó y qué verificación pasó?"** (pausa) "Nosotros lo imprimimos
con un click. Y no porque hagamos compliance: porque trabajamos bien y el informe sale solo."
→ enseñar `aiact-report.html` de un change real. Luego seguir con la herida (abajo).

## 0. La herida (2 min)
"Levantad la mano: ¿quién ha hecho merge de código que 'el modelo dijo que estaba bien'?"
- Junio 2026: la IA escribe la mayoría del código nuevo. La pregunta ya no es *si* genera — es **¿quién
  responde cuando el verde era mentira?**
- Anécdota real (nuestra): un modelo de sesión **fabricó** un "GREEN, tests pasados" a los 44 segundos…
  con el pipeline aún en la primera fase. Eso es lo que pasa cuando el LLM se auto-certifica.

## 1. La tesis (1 min)
**El modelo nunca debe ser su propio juez.** conductor = pipeline SDD donde:
1) el **código** conduce las fases (ni el peor modelo se las salta),
2) un **gate determinista** (sin LLM) verifica spec↔código↔contratos,
3) cada verde queda **firmado** (Ed25519) y **encadenado** (ledger).

## 2. DEMO A — el gate caza lo que el ojo no ve (7 min) ⭐
En vivo, 3 comandos, offline, 0 tokens (docs/demo-brownfield/):
1. `conductor explain src/` → un legacy SIN spec queda radiografiado (3 endpoints → borrador OpenSpec).
   *"El legacy entra al mundo SDD en un comando."*
2. Llega la 'mejora' v2 de la API → `conductor contract base.json head.json` →
   **6 BREAKING en rojo** (endpoint eliminado, enum recortado, required nuevo…) — exit≠0, build roto,
   SARIF para el PR. *"Nadie opinó. Se DEMOSTRÓ."*
3. La migración de BD que venía con ello → `conductor contract base.sql head.sql` → **2 BREAKING**
   (tipo cambiado, columna borrada). Mismo gate, otra lente; y `migrate` lintea las migraciones.
Punchline: **da igual Angular, Java, Magento o SAP — el gate no sabe de frameworks, sabe de contratos.**

## 3. DEMO B — el pipeline gobernado en vivo (6 min)
`conductor serve .` → el PANEL: lanzar "añade X" desde el navegador (sin tocar una terminal de IA):
- La web en vivo: fases, **pausa de revisión** (leer la spec → Aprobar), archivos ±creados, **diff al
  click**, registro del run, **■ Detener** (y reanudar sin re-pagar).
- El detalle que mata: **mezcla de proveedores por fase** — planner en qwen BYOK ($0), coder en
  Sonnet/Haiku (AI Credits) — *"lo que la plataforma no permite por sesión, conductor lo hace por fase"*.
- Cierre: GREEN → `provenance.json` firmado + ledger. `conductor verify` delante del público:
  *"manipulad el fichero — la firma canta. Esto se le puede enseñar a un auditor."*
- Contador de coste en vivo al lado (tokens por fase, Δ gasto real). Con los precios de jun-2026, esta
  transparencia ES la historia que un CTO recuerda.

## 4. Por qué nadie más (2 min)
Spec-Kit (93k★): specs sí, verificación no. Kiro: multi-agente, atado a su IDE. Agent HQ: gobierno de
*acceso*, no de *corrección*. **El cuadrante "SDD + gate determinista + provenance firmada + coste por
fase" está vacío. Ahí vivimos.**

## 5. Cierre (1 min)
"No vendemos un generador de código más rápido. Vendemos **la prueba de que lo generado es correcto** —
con cualquier modelo, en cualquier stack, al precio que tú decidas. El verde de conductor no se pide:
se demuestra y se firma."

## Checklist técnico pre-charla
- [ ] Pass-rates en README (correr E1-E6 antes del evento)
- [x] Apertura AI Act integrada (v3) · Demo B ahora es LA APP (:4750, PWA): lanzar desde el panel, editar la spec en la pausa, nota, modelo en caliente, rollback
- [ ] Proyecto demo-brownfield ensayado en la máquina de la charla (offline-safe)
- [ ] Panel + un run grabado en vídeo como plan B (si la wifi/los dioses fallan)
- [ ] Slide única de arquitectura: driver → fases → gate → sello → ledger
