import { html, nothing, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { CElement } from '../core/element';
import { ConductorApi } from '../api/client';
import { router } from '../router';
import type { ProjectSummary, ChangeSummary, ModelsResponse, ModelsByRole, GhUsage, Usage, SearchHit, ArchiveEntry, PhaseEstimate, PlanCheck } from '../api/types';
import { fmt, kebab, verdictClass, sanitizeProjects } from '../lib/format';
import '../components/status-pill';
import '../components/mention-input';

// El usuario NO clasifica la tarea (ni "complejidad" ni "gobierno", ni etiquetas de talla). Describe el cambio y
// le ENSEÑAMOS el PLAN como las FASES SDD REALES de OpenSpec (propose/spec/design/tasks/apply/verify) — cada una
// con su artefacto y, si la tiene, su comprobación — más QUÉ checks extra se activan por contenido y por qué. El
// motor lo deriva (resolvePlan, 0 LLM/0 tokens); aquí solo se pinta. Nombres reales = los de OpenSpec, no inventos.
const PHASE_INFO: Record<string, { artifact: string; gate?: string }> = {
  explore: { artifact: 'exploration.md' },
  propose: { artifact: 'proposal.md' },
  clarify: { artifact: 'questions.md' },
  spec: { artifact: 'spec.md', gate: 'estructura + escenarios' },
  design: { artifact: 'design.md' },
  tasks: { artifact: 'tasks.md' },
  apply: { artifact: 'código + tests', gate: 'secretos · trazabilidad' },
  verify: { artifact: 'verify-report.md', gate: 'gate determinista (innegociable)' },
  fix: { artifact: 'apply-report.md' },
};
// ORDEN de ejecución canónico de las fases SDD (el motor lo reimpone; aquí solo se pintan los checkboxes en este orden).
// `fix` NO es elegible: lo inserta el motor automáticamente si verify falla (auto-reparación), no el usuario.
const CANON_PHASES = ['explore', 'propose', 'clarify', 'spec', 'design', 'tasks', 'apply', 'verify'];
// GOBIERNO INNEGOCIABLE: estas 3 NO se pueden desmarcar. spec (sin ella no hay coherencia que verificar),
// apply (sin código no hay nada que entregar) y verify (gate determinista, el motor lo reimpone como fase TERMINAL).
const LOCKED_PHASES = ['spec', 'apply', 'verify'];

/** PANTALLA / : métricas del proyecto + formulario de lanzamiento + lista de runs (multi-proyecto). */
@customElement('panel-screen')
export class PanelScreen extends CElement {
  @state() private projects: ProjectSummary[] = [];
  @state() private gh: GhUsage | null = null;
  @state() private usage: Usage | null = null;
  @state() private version = ''; // versión del motor (badge visible → un relevo de versión no es invisible, #10)
  @state() private models: ModelsResponse | null = null;
  @state() private req = '';
  @state() private name = '';
  @state() private complexity = 'medium';
  @state() private auto = false;
  @state() private projId = '';
  @state() private mPlanner = '';
  @state() private mCoder = '';
  @state() private mReviewer = '';
  @state() private preset = ''; // preset de MODELO/coste activo: '' | 'cost' | 'quality' | 'clear' (resalta el botón elegido)
  @state() private busy = false;
  @state() private error = '';
  @state() private atts: { name: string; data: string }[] = []; // capturas pegadas/arrastradas → attachments/ del change
  @state() private savingDefaults = false; // guardando la mezcla como default del proyecto (openspec/conductor.json)
  @state() private saveDefaultsMsg = '';
  @state() private est: { total: number; rows: PhaseEstimate[]; saved: number; actions: string[]; checks: PlanCheck[]; testCmd: string | null } | null = null;
  @state() private phaseSel: string[] = []; // fases SDD marcadas en los checkboxes — fuente de verdad de la selección
  @state() private runTests = false; // toggle "test": ejecutar las pruebas REALES del proyecto tras el gate (opcional, no es fase)
  @state() private initBusy = false; // inicializando el proyecto activo desde la web
  private initMsg = '';
  private pipelineTouched = false; // el experto tocó los checkboxes → el pipeline elegido MANDA (se envía al lanzar y al estimar)
  private estSeq = 0; // sella cada estimate (last-write-wins): una respuesta tardía no pisa la tabla/selección actuales
  private proposedPlan: string[] = []; // plan PROPUESTO completo (estimate SIN pipeline) → "restablecer" lo restaura exacto
  @state() private q = '';
  @state() private hits: SearchHit[] = [];
  @state() private archived: ArchiveEntry[] = [];
  private defProjId = '';
  private estTimer: ReturnType<typeof setTimeout> | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private liveTimer: ReturnType<typeof setInterval> | null = null;
  private api = new ConductorApi('/api/');

  override connectedCallback(): void {
    super.connectedCallback();
    void this.load();
    // refresco EN VIVO (como la sidebar): nuevos runs/metrics aparecen sin recargar.
    this.liveTimer = setInterval(() => void this.refreshChanges(), 5000);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.liveTimer) clearInterval(this.liveTimer);
  }

  private async load(): Promise<void> {
    await this.refreshChanges();
    try { this.archived = (await this.api.archive()).archive ?? []; } catch { /* opcional */ }
    try { this.models = await this.api.models(); } catch { /* opcional */ }
  }

  // proyectos + métricas + créditos. Se auto-cura ante un fallo puntual de fetch: conserva el último dato
  // bueno en vez de resetear a 0 (antes el panel cargaba 1 vez y se quedaba vacío si esa carga fallaba).
  private async refreshChanges(): Promise<void> {
    try {
      const d = await this.api.changes();
      this.projects = sanitizeProjects(d.projects); // saneo en el BORDE: projects array, cada uno objeto con changes array → todo .map/.filter downstream a salvo de datos corruptos
      this.gh = d.ghUsage ?? null;
      this.usage = d.usage ?? null;
      this.version = d.version ?? '';
      // PROYECTO ACTIVO por ID ESTABLE (no por nombre — dos repos con el mismo basename ya no colisionan, #9).
      const served = d.projectId || this.projects.find((p) => p.name === d.project)?.id || this.projects[0]?.id || '';
      this.defProjId = served;
      // ARRANQUE PER-REPO (Opción A): sin selector en la web, el FOCO lo manda el SERVIDOR (focusId, que el
      // arranque (`conductor`/tool conductor_app) fija vía /api/focus al repo desde el que lanzaste). El panel SIGUE ese foco en CADA
      // poll → una pestaña ya abierta en OTRO repo se re-enfoca a ESTE en ≤5s, sin depender de que el navegador
      // navegue a un ?project=. Si el servidor devuelve vacío puntualmente, se conserva el último foco bueno.
      if (served) this.projId = served;
    } catch { /* conserva el último dato bueno */ }
  }

  private nameTouched = false; // el usuario editó el nombre a mano → dejamos de auto-rellenarlo desde la descripción
  private onReq(v: string): void {
    this.req = v;
    // auto-nombre: SIGUE a la descripción mientras el usuario no lo haya tocado. Ignora las menciones @fichero y /skill
    // (son contexto, no parte del nombre del cambio) para no ensuciar el kebab.
    if (!this.nameTouched) this.name = kebab(this.req.replace(/[@/]\S+/g, ' ').split(/\s+/).slice(0, 6).join(' '));
    this.scheduleEstimate();
  }
  // coste visible en el punto de decisión: estima tokens (preflight, sin API) con debounce
  private scheduleEstimate(): void {
    if (this.estTimer) clearTimeout(this.estTimer);
    this.estTimer = setTimeout(() => void this.fetchEstimate(), 350);
  }
  private async fetchEstimate(): Promise<void> {
    if (!this.req.trim()) { this.est = null; this.phaseSel = []; this.pipelineTouched = false; this.runTests = false; return; }
    // sella la petición ANTES del await y captura `touched` (no se re-lee tras el await: evita la carrera con un
    // toggle/tecla que llegue mientras la respuesta viaja). last-write-wins: solo la respuesta más reciente aplica.
    const seq = ++this.estSeq;
    const touched = this.pipelineTouched;
    try {
      // El usuario NO clasifica: pedimos el PLAN por la petición. El servidor (resolvePlan) devuelve las ACCIONES
      // que se harán + las COMPROBACIONES que se activan por contenido (cada una con su porqué) + la complejidad
      // interna que el motor ejecutará. Si el experto tocó los checkboxes, mandamos ese pipeline → el estimate
      // (tokens + acciones) refleja EXACTO las fases elegidas (estimate == run). El plan MOSTRADO == el LANZADO.
      const e = await this.api.estimate(this.req, touched ? this.effectivePipeline() : undefined);
      if (seq !== this.estSeq) return; // respuesta OBSOLETA (el usuario siguió tecleando/toggleando) → no pisar el estado
      this.est = { total: e.total, rows: e.phases, saved: e.noRescanSaved, actions: e.actions ?? [], checks: e.checks ?? [], testCmd: e.testCmd ?? null };
      this.complexity = e.complexity || this.complexity; // profundidad interna derivada del contenido (nunca se muestra como talla)
      // SISTEMA PROPONE, EXPERTO MANDA: sin tocar checkboxes la selección SIGUE al plan derivado; además cacheamos el
      // plan PROPUESTO COMPLETO (pedido SIN pipeline) para que "restablecer" lo restaure EXACTO (no la selección reducida).
      if (!touched) { this.phaseSel = e.phases.map((r) => r.phase); this.proposedPlan = e.phases.map((r) => r.phase); }
      if (!e.testCmd) this.runTests = false; // sin comando de pruebas detectado no se puede ejecutar nada
    } catch { /* hint opcional */ }
  }

  // fases marcadas en ORDEN canónico, con las obligatorias SIEMPRE incluidas (gobierno). Lo que se manda al motor.
  private effectivePipeline(): string[] {
    const sel = new Set([...this.phaseSel, ...LOCKED_PHASES]);
    return CANON_PHASES.filter((p) => sel.has(p));
  }
  // marcar/desmarcar una fase opcional. Las obligatorias no se tocan. Recalcula tokens/acciones con lo elegido.
  private togglePhase(ph: string): void {
    if (LOCKED_PHASES.includes(ph)) return; // gobierno: no se puede quitar
    this.pipelineTouched = true;
    const next = this.phaseSel.includes(ph) ? this.phaseSel.filter((p) => p !== ph) : [...this.phaseSel, ph];
    this.phaseSel = CANON_PHASES.filter((p) => next.includes(p)); // re-ordena canónicamente
    this.scheduleEstimate(); // estimate == run: la tabla de tokens y las acciones reflejan las fases elegidas
  }
  // vuelve al plan PROPUESTO por el motor (deshace la edición manual de fases)
  private resetPipeline(): void {
    this.pipelineTouched = false;
    // restaura el plan PROPUESTO completo desde la caché (instantáneo, robusto ante fallo de red); el re-estimate
    // siguiente refresca tokens/acciones. Antes derivaba de est.rows, que tras un toggle contiene el plan REDUCIDO.
    if (this.proposedPlan.length) this.phaseSel = [...this.proposedPlan];
    this.scheduleEstimate();
  }
  // pipeline a enviar en el launch: solo si el experto tocó los checkboxes (si no, el motor usa su plan/config)
  private pipelineForLaunch(): string[] | undefined {
    return this.pipelineTouched ? this.effectivePipeline() : undefined;
  }

  // buscar en runs vivos + archivo (sin LLM): el motor recorre openspec/changes y archive/
  private onSearch(e: Event): void {
    this.q = (e.target as HTMLInputElement).value;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.runSearch(), 280);
  }
  private async runSearch(): Promise<void> {
    if (!this.q.trim()) { this.hits = []; return; }
    try { this.hits = (await this.api.search(this.q)).hits ?? []; } catch { /* búsqueda opcional */ }
  }

  // IMÁGENES en la petición (capturas de bugs, mockups): pegar (Ctrl+V) o arrastrar sobre el campo. Van al
  // change como attachments/ y la petición referencia sus rutas — el agente las abre con `view` en cada fase.
  private addImageFiles(files: FileList | File[] | null): void {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (!/^image\//.test(f.type)) continue;
      if (this.atts.length >= 4) { this.error = 'máximo 4 imágenes por run'; break; }
      if (f.size > 3 * 1048576) { this.error = `«${f.name || 'imagen'}» supera 3 MB — recórtala o comprímela`; continue; }
      const rd = new FileReader();
      rd.onload = () => { this.atts = [...this.atts, { name: f.name || 'captura.png', data: String(rd.result || '') }]; };
      rd.readAsDataURL(f);
    }
  }
  private onReqPaste(e: ClipboardEvent): void {
    const files = e.clipboardData?.files;
    if (files && files.length) { e.preventDefault(); this.addImageFiles(files); }
  }
  private onReqDrop(e: DragEvent): void { e.preventDefault(); this.addImageFiles(e.dataTransfer?.files ?? null); }

  private async launch(e: Event): Promise<void> {
    e.preventDefault();
    if (!this.req.trim() || !this.name) { this.error = 'Indica la petición y el nombre del cambio'; return; }
    this.busy = true; this.error = '';
    const models: ModelsByRole = {};
    if (this.mPlanner) models.planner = this.mPlanner;
    if (this.mCoder) models.coder = this.mCoder;
    if (this.mReviewer) models.reviewer = this.mReviewer;
    try {
      const r = await this.api.launch({
        request: this.req, name: kebab(this.name), complexity: this.complexity, auto: this.auto,
        projectId: this.projId || undefined,
        models: Object.keys(models).length ? models : undefined,
        pipeline: this.pipelineForLaunch(), // fases elegidas en los checkboxes (real: el motor ejecuta EXACTO esto)
        runTests: this.runTests, // toggle "test": ejecutar las pruebas reales del proyecto tras el gate (opcional)
        attachments: this.atts.length ? this.atts : undefined, // capturas → attachments/ del change (view en las fases)
      });
      if (r.ok && r.url) { this.atts = []; router.go(r.url); return; }
      // backstop del gate de gobierno: si el server dice "sin init", refresca para que la UI muestre el CTA Inicializar
      if (r.needsInit) { await this.refreshChanges(); this.error = ''; return; }
      this.error = r.error ?? 'no se pudo lanzar';
    } catch (e) { this.error = (e as Error).message; }
    finally { this.busy = false; }
  }

  // INICIALIZAR desde la web (coherencia "desde la app web"): crea openspec/ en el proyecto activo sin volver a la
  // terminal. Tras inicializar, el proyecto pasa a SDD → aparece el formulario de lanzamiento (gating == visibilidad).
  private async doInit(): Promise<void> {
    this.initBusy = true; this.initMsg = '';
    try {
      const r = await this.api.init(this.projId || undefined);
      if (r.ok) await this.refreshChanges(); // openspec:true → render cambia al formulario
      else this.initMsg = r.error ?? 'no se pudo inicializar';
    } catch (e) { this.initMsg = (e as Error).message; }
    finally { this.initBusy = false; }
  }

  // estado "sin inicializar": un único CTA en vez de un formulario que lanzaría sobre un proyecto sin gobierno.
  private initPanel(active: ProjectSummary): TemplateResult {
    return html`
      <div class="launch-init" style="display:flex;flex-wrap:wrap;align-items:center;gap:.8rem;padding:1rem 1.1rem;border:1px solid var(--bd);border-left:3px solid var(--accent);border-radius:var(--r);background:var(--accentbg);color:var(--tx)">
        <span style="font-size:.9rem"><b>${active.name}</b> aún no tiene gobierno SDD.</span>
        <button class="btn" ?disabled=${this.initBusy} @click=${() => void this.doInit()}>${this.initBusy ? 'Inicializando…' : 'Inicializar'}</button>
        <span class="muted" style="font-size:.76rem">crea <code>openspec/</code> · no toca tu código</span>
        ${this.initMsg ? html`<p role="alert" style="margin:0;font-size:.82rem;color:var(--bad);flex-basis:100%">${this.initMsg}</p>` : nothing}
      </div>`;
  }

  // ── RADIOGRAFÍA DEL REPO (degustación gratis) ─────────────────────────────────────────────────
  // GET /api/explain = ingeniería inversa DETERMINISTA del código (0 LLM · 0 tokens · 0 red): el motor
  // lee el repo enfocado y devuelve las capacidades que ya entiende. Es el "pruébalo sin pagar" del
  // panel: un proyecto SIN runs ve valor ANTES de lanzar nada; con runs sobrevive como pliegue discreto.

  private async resume(p: ProjectSummary, c: ChangeSummary): Promise<void> {
    const r = await this.api.resumeNamed(c.name, p.id);
    if (r.ok && r.url) router.go(r.url);
  }
  // «re-run with changes» (patrón de cockpits de referencia): rellena el form con la petición de un run
  // pasado para lanzar una variante — el historial deja de ser solo lectura.
  private reuse(c: ChangeSummary): void {
    this.nameTouched = false;
    // el plan se RE-PROPONE para la nueva petición: sin esto, reutilizar tras editar fases arrastraba la
    // selección de OTRO request (el plan mostrado no correspondía a la petición reutilizada).
    this.pipelineTouched = false; this.phaseSel = []; this.proposedPlan = [];
    this.onReq(c.request);
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* sin window */ }
  }

  private metrics(projects: ProjectSummary[]): { total: number; green: number; curso: number; tin: number; tout: number } {
    const all = projects.flatMap((p) => p.changes ?? []);
    return {
      total: all.length,
      green: all.filter((c) => verdictClass(c.verdict) === 'GREEN').length,
      curso: all.filter((c) => verdictClass(c.verdict) === 'CURSO').length,
      tin: all.reduce((a, c) => a + (c.tokens?.in ?? 0), 0),
      tout: all.reduce((a, c) => a + (c.tokens?.out ?? 0), 0),
    };
  }
  // FOCO en el proyecto ACTIVO por defecto; "ver todos" agrega el global (coherencia #8: lo global es opt-in).
  private activeProject(): ProjectSummary | null { return this.projects.find((p) => p.id === this.projId) ?? null; }
  private scopeProjects(): ProjectSummary[] {
    // Opción A: siempre el proyecto EN FOCO (no hay «ver todos» — el selector se eliminó; el foco lo manda el servidor).
    const a = this.activeProject();
    return a ? [a] : this.projects;
  }

  // ARRANQUE PER-REPO (Opción A · arranque-per-repo): la app ES el repo desde el que lanzaste. Se QUITÓ el
  // selector de proyecto (dropdown + «ver todos» + «Añadir proyecto»): dejaba cambiar de proyecto y lanzar una
  // feature en OTRO repo desde esta misma ventana — la incoherencia "lancé en A, construyo en B". Para trabajar
  // en otro repo se lanza `conductor` DESDE él: el arranque abre la app ENFOCADA en ese repo (`?project=<id>`). El
  // foco lo fija el ARRANQUE, no un menú. La banda «Tu atención» (pausas de CUALQUIER repo) se conserva aparte:
  // solo AVISA (enlace de solo-lectura), nunca lanza — por eso no reabre el agujero.

  // pausas esperando decisión humana en CUALQUIER proyecto — lo único que justifica cruzar el foco
  private attention(): Array<{ p: ProjectSummary; c: ChangeSummary }> {
    return this.projects.flatMap((p) => (p.changes ?? []).filter((c) => c.pending).map((c) => ({ p, c })));
  }

  private modelOptions(): string[] {
    const m = this.models;
    if (!m) return [];
    // no mostrar modelos NO disponibles: byok solo si hay credenciales (si no, lanzar daría BLOCKED)
    const byok = m.byokCreds ? m.byok.map((x) => 'byok:' + x) : [];
    return [...byok, ...m.copilot.map((x) => 'copilot:' + x)];
  }

  // tier → peso para ordenar (premium=3, balanced=2, economy=1; desconocido = balanced)
  private tierRank(t?: string): number { return t === 'premium' ? 3 : t === 'economy' ? 1 : 2; }

  // PRESETS de modelo por fase. "Optimizar coste" es el pilar de la herramienta hecho un clic: el Coder
  // (la fase que más tokens gasta) va al modelo LiteLLM gratis, el Reviewer (gate innegociable) a un Copilot
  // capaz pero no al tier más caro, y el Planner a un Copilot económico. El experto puede ajustar después.
  private applyPreset(kind: 'cost' | 'quality' | 'clear'): void {
    this.preset = kind; // marca el preset activo (estado visible en los botones)
    if (kind === 'clear') { this.mPlanner = ''; this.mCoder = ''; this.mReviewer = ''; return; }
    const m = this.models; if (!m) return;
    const tiers = m.tiers ?? {};
    const cop = [...m.copilot];
    const cheapest = cop.length ? 'copilot:' + [...cop].sort((a, b) => this.tierRank(tiers[a]) - this.tierRank(tiers[b]))[0] : '';
    const strongest = cop.length ? 'copilot:' + [...cop].sort((a, b) => this.tierRank(tiers[b]) - this.tierRank(tiers[a]))[0] : '';
    let p = '', c = '', r = '';
    if (kind === 'quality') {
      p = c = r = strongest;
    } else { // cost
      // reviewer capaz pero sin pasarse: el mejor NO-premium (p. ej. sonnet) sobre opus — verificar es de
      // pocos tokens y no merece el tier más caro salvo que sea lo único disponible.
      const nonPremium = cop.filter((x) => tiers[x] !== 'premium');
      const pool = nonPremium.length ? nonPremium : cop;
      const reviewer = pool.length ? 'copilot:' + [...pool].sort((a, b) => this.tierRank(tiers[b]) - this.tierRank(tiers[a]))[0] : '';
      // Coder = el BYOK más BARATO por tier (el LiteLLM económico antes que un sonnet-vía-byok), no el alfabético
      const cheapestByok = m.byok.length ? 'byok:' + [...m.byok].sort((a, b) => this.tierRank(tiers[a]) - this.tierRank(tiers[b]))[0] : '';
      const hasByok = m.byokCreds && m.byok.length > 0;
      c = hasByok ? cheapestByok : cheapest;
      p = cheapest;
      r = reviewer || cheapest;
    }
    // CLAMP: nunca dejar un <select> con un valor que NO esté entre sus <option> (modelOptions). Si el
    // catálogo cambió, un valor huérfano daría estado HTML inválido y un 400 al lanzar — lo saneamos aquí.
    const opts = this.modelOptions();
    const inOpts = (v: string): string => (v && opts.includes(v)) ? v : '';
    this.mPlanner = inOpts(p); this.mCoder = inOpts(c); this.mReviewer = inOpts(r);
  }

  // B5 (plan expertise): persistir la mezcla elegida en openspec/conductor.json — "defaults en el repo,
  // la web los cambia". El servidor valida contra el catálogo y hace merge conservador (jamás pisa otras claves).
  private async saveModelsDefault(): Promise<void> {
    const models: Record<string, string> = {};
    if (this.mPlanner) models.planner = this.mPlanner;
    if (this.mCoder) models.coder = this.mCoder;
    if (this.mReviewer) models.reviewer = this.mReviewer;
    this.savingDefaults = true; this.saveDefaultsMsg = '';
    try {
      const r = await this.api.modelsDefault(models, this.projId || undefined);
      this.saveDefaultsMsg = r.ok ? '✓ guardado en openspec/conductor.json — commitéalo para tu equipo' : (r.error ?? 'no se pudo guardar');
    } catch (e) { this.saveDefaultsMsg = (e as Error).message; }
    finally { this.savingDefaults = false; setTimeout(() => { this.saveDefaultsMsg = ''; }, 6000); }
  }

  private byokHost(): string {
    const u = this.models?.byokUrl || '';
    try { return new URL(u).host; } catch { return u || 'LiteLLM'; }
  }

  // ESTADO LiteLLM, fichero-first (decisión de producto): la credencial vive en ~/.conductor/byok.json —
  // la miniweb NUNCA pide la API key (ni la transporta); solo muestra si está conectado y, si algo falla,
  // el MOTIVO y cómo arreglarlo en el fichero/terminal. Mismo patrón que un opencode.json: config como dato.
  private byokForm(): TemplateResult {
    const m = this.models;
    const reason = m?.byokReason ?? null;
    // HONESTIDAD del badge: "Conectado" SOLO con el catálogo del proxy verificado EN VIVO en esta sesión.
    // Con creds pero sin verificación (arranque reciente, red caída, timeout del sondeo) → "Configurado"
    // (neutro): antes ese hueco se pintaba verde y podía contradecir un 401 real segundos después.
    const live = String(m?.byokSource ?? '').includes('en vivo');
    const connected = !!m?.byokCreds && !reason && live;
    const configured = !!m?.byokCreds && !reason && !live;
    const fileHint = html`<p class="inst-note">Abre <code>~/.conductor/litellm.json</code> (<code>conductor setup</code> deja la plantilla creada) y rellena tus datos — este es el formato:</p>
      <pre class="inst-code">{
  "baseUrl": "https://…/v1",
  "apiKey": "sk-…",
  "models": {
    "deepseek-v4-flash": { "limit": { "context": 250000, "output": 16384 } },
    "glm-v52": { "limit": { "context": 250000, "output": 16384 } }
  }
}</pre>
      <p class="inst-note"><code>models</code> = tu catálogo declarado: sale SIEMPRE en el selector (sin depender del proxy) y sus límites
      viajan a cada fase. Al primer uso conductor <strong>sella</strong> el fichero: cifra la key (AES-256-GCM, Win/Mac/Linux) y la
      versión en claro desaparece del disco. <strong>Nunca sale de tu máquina</strong>, no se registra ni se cachea.</p>`;
    if (connected) {
      // CONECTADO = readout de instrumento: LED verde + pill "Conectado" + pares clave→valor.
      return html`
        <details class="inst-panel" style="margin-top:.6rem">
          <summary class="inst-head">
            <span class="inst-led on-ok" aria-hidden="true"></span>
            <span class="inst-title">LiteLLM</span>
            <span class="inst-status ok">Conectado</span>
            <span class="inst-chev" aria-hidden="true"></span>
          </summary>
          <div class="inst-body">
            <dl class="readout">
              <div class="ro-row"><dt>Proveedor</dt><dd>${this.byokHost()}</dd></div>
              <div class="ro-row"><dt>Credencial</dt><dd>~/.conductor/litellm.json · cifrada (AES-256-GCM)</dd></div>
              <div class="ro-row"><dt>Privacidad</dt><dd>Nunca sale de tu máquina · no se registra</dd></div>
            </dl>
            <p class="inst-note">¿Key caducada o rotada? Escribe la nueva en <code>~/.conductor/litellm.json</code>
              (campo <code>apiKey</code>; conductor la re-sella al primer uso) o ejecuta <code>conductor litellm login</code>.</p>
          </div>
        </details>`;
    }
    if (configured) {
      // CONFIGURADO = creds presentes pero catálogo del proxy AÚN sin verificar en esta sesión (arranque,
      // red, timeout). Badge neutro — jamás prometer "Conectado" sin evidencia viva.
      return html`
        <details class="inst-panel" style="margin-top:.6rem">
          <summary class="inst-head">
            <span class="inst-led" aria-hidden="true"></span>
            <span class="inst-title">LiteLLM</span>
            <span class="inst-status idle">Configurado</span>
            <span class="inst-chev" aria-hidden="true"></span>
          </summary>
          <div class="inst-body">
            <dl class="readout">
              <div class="ro-row"><dt>Proveedor</dt><dd>${this.byokHost()}</dd></div>
              <div class="ro-row"><dt>Credencial</dt><dd>~/.conductor/litellm.json · cifrada (AES-256-GCM)</dd></div>
              <div class="ro-row"><dt>Catálogo</dt><dd>sin verificar aún en esta sesión — se comprueba al abrir el selector de modelos o lanzar un run</dd></div>
            </dl>
            <p class="inst-note">Si el proxy rechaza la key, aquí saldrá el motivo y cómo arreglarlo.</p>
          </div>
        </details>`;
    }
    if (m?.byokCreds && reason) {
      // HAY credencial pero el proveedor la rechaza (rotada/revocada) o no descifra → motivo + remedio, sin formulario.
      return html`
        <details class="inst-panel inst-prompt" style="margin-top:.6rem" open>
          <summary class="inst-head">
            <span class="inst-led on-warn" aria-hidden="true"></span>
            <span class="inst-title">LiteLLM</span>
            <span class="inst-status warn">Atención</span>
            <span class="inst-chev" aria-hidden="true"></span>
          </summary>
          <div class="inst-body">
            <div class="inst-msg bad" role="status" aria-live="polite">${reason}</div>
            ${fileHint}
          </div>
        </details>`;
    }
    // SIN conectar = LED ámbar + instrucciones de fichero (configuración como DATO, no como formulario).
    return html`
      <details class="inst-panel inst-prompt" style="margin-top:.6rem">
        <summary class="inst-head">
          <span class="inst-led on-warn" aria-hidden="true"></span>
          <span class="inst-title">Conectar LiteLLM</span>
          <span class="inst-status warn">Configuración única</span>
          <span class="inst-chev" aria-hidden="true"></span>
        </summary>
        <div class="inst-body">
          <p class="inst-note">Conecta tu proxy LiteLLM <strong>una sola vez</strong> para usar tus modelos corporativos (más baratos, 0 AI Credits) en las fases que elijas.</p>
          ${fileHint}
          ${reason ? html`<div class="inst-msg bad" role="status" aria-live="polite">${reason}</div>` : nothing}
        </div>
      </details>`;
  }

  // PLAN del run = las FASES SDD REALES (OpenSpec) que se ejecutarán, como CHECKBOXES: el motor PROPONE el conjunto
  // (derivado del contenido, 0 tokens) y el experto MANDA — marca/desmarca las opcionales. spec/apply/verify son
  // obligatorias (gobierno) y van bloqueadas con 🔒. Lo elegido es REAL: se envía al motor y el run ejecuta EXACTO eso
  // (verify se reimpone como fase terminal). Debajo, los checks que enciende el contenido (con su porqué).
  private planPanel(): TemplateResult {
    const checks = this.est?.checks ?? [];
    const always = checks.filter((c) => c.always);
    const conditional = checks.filter((c) => !c.always);
    const sel = new Set(this.phaseSel);
    return html`
      <div class="launch-plan" style="margin:.1rem 0 .2rem;padding:.7rem .9rem;border-left:3px solid var(--accent);background:var(--accentbg);border-radius:7px;color:var(--tx)">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:.6rem">
          <span style="font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--tx2);font-weight:600">Plan · fases SDD (OpenSpec)</span>
          ${this.pipelineTouched ? html`<button type="button" @click=${() => this.resetPipeline()} style="background:none;border:none;padding:0;font-size:.74rem;color:var(--accent,#4f7cff);cursor:pointer;text-decoration:underline">restablecer plan propuesto</button>` : nothing}
        </div>
        <p class="muted" style="margin:.2rem 0 .1rem;font-size:.74rem">Marca las fases que se ejecutarán. <strong style="font-weight:600">spec · apply · verify</strong> son obligatorias (gobierno).</p>
        <ul role="group" aria-label="Fases SDD del run" style="margin:.35rem 0 0;padding:0;list-style:none;font-size:.85rem;line-height:1.5">
          ${CANON_PHASES.map((ph) => {
            const info = PHASE_INFO[ph];
            const locked = LOCKED_PHASES.includes(ph);
            const checked = locked || sel.has(ph);
            return html`<li style="padding:.12rem 0">
              <label style="display:flex;align-items:center;gap:.45rem;cursor:${locked ? 'default' : 'pointer'};${checked ? '' : 'opacity:.5'}">
                <input type="checkbox" .checked=${checked} ?disabled=${locked} @change=${() => this.togglePhase(ph)} aria-label="${ph}${locked ? ' (obligatoria, no se puede quitar)' : ' (opcional)'}">
                <strong style="font-weight:600">${ph}</strong>
                ${locked ? html`<span title="obligatoria — gobierno innegociable" aria-hidden="true">🔒</span>` : nothing}
                ${info?.artifact ? html`<span class="muted" style="font-weight:400">→ ${info.artifact}</span>` : nothing}
                ${info?.gate ? html`<span class="muted" style="font-weight:400">· ${info.gate}</span>` : nothing}
              </label>
            </li>`;
          })}
        </ul>
        <div style="margin-top:.5rem;padding-top:.5rem;border-top:1px dashed var(--bd,#d8dee9)">
          <label style="display:flex;align-items:center;gap:.45rem;cursor:${this.est?.testCmd ? 'pointer' : 'not-allowed'};${this.est?.testCmd ? '' : 'opacity:.5'}" title=${this.est?.testCmd ? 'Ejecuta las pruebas REALES del proyecto ANTES de verify. Si fallan → ciclo fix → reintenta; si no pasan tras N intentos, el run queda BLOCKED.' : 'No se detectó comando de pruebas en este proyecto'}>
            <input type="checkbox" .checked=${this.runTests} ?disabled=${!this.est?.testCmd} @change=${(ev: Event) => { this.runTests = (ev.target as HTMLInputElement).checked; }} aria-label="ejecutar las pruebas del proyecto tras el gate (opcional)">
            <strong style="font-weight:600">test</strong>
            ${this.est?.testCmd ? html`<span class="muted" style="font-weight:400">→ ejecutar pruebas del proyecto · <code style="font-size:.85em">${this.est.testCmd}</code></span>` : html`<span class="muted" style="font-weight:400">→ sin comando de pruebas detectado</span>`}
          </label>
          <p class="muted" style="margin:.1rem 0 0 1.55rem;font-size:.72rem">Opcional · corre ANTES de verify (apply → test → fix → verify). Si fallan, reintenta con fix; si no pasan, BLOCKED.</p>
        </div>
        ${always.length ? html`
          <div style="margin-top:.5rem;font-size:.82rem"><span class="muted">Comprobaré:</span></div>
          <ul style="margin:.2rem 0 0;padding-left:1.15rem;font-size:.82rem;line-height:1.5">
            ${always.map((c) => html`<li>${c.label}</li>`)}
          </ul>` : nothing}
        ${conditional.length ? html`
          <div style="margin-top:.45rem;font-size:.82rem"><span class="muted">Recomendado para este cambio</span> <span class="muted" style="font-size:.76rem">· actívalo en openspec/conductor.json</span></div>
          <ul style="margin:.2rem 0 0;padding-left:1.15rem;font-size:.82rem;line-height:1.5">
            ${conditional.map((c) => html`<li>${c.label}${c.why ? html` <span class="muted">— ${c.why}</span>` : nothing}</li>`)}
          </ul>` : nothing}
      </div>`;
  }

  override render(): TemplateResult {
    // FOCO: por defecto solo el proyecto activo; "ver todos" agrega el global (#8 — lo global es opt-in).
    const scope = this.scopeProjects();
    const m = this.metrics(scope);
    const opts = this.modelOptions();
    // Separa runs activos de completados para jerarquía visual clara (sobre el scope activo/global)
    const activeItems = scope.flatMap((p) =>
      (p.changes ?? []).filter((c) => verdictClass(c.verdict) === 'CURSO').map((c) => ({ p, c }))
    );
    const doneItems = scope.flatMap((p) =>
      (p.changes ?? []).filter((c) => verdictClass(c.verdict) !== 'CURSO').map((c) => ({ p, c }))
    );
    const launchForm = html`
      <form class="launch-form" @submit=${(e: Event) => void this.launch(e)}>
        <label class="fl" @paste=${(e: ClipboardEvent) => this.onReqPaste(e)} @drop=${(e: DragEvent) => this.onReqDrop(e)} @dragover=${(e: DragEvent) => e.preventDefault()}>Qué quieres construir
          <mention-input .value=${this.req} .projId=${this.projId} placeholder="Describe el cambio en una frase o pega una spec. Escribe @ para dar contexto de un fichero · / para aplicar una skill del equipo · pega o arrastra capturas" @cdr-input=${(e: Event) => this.onReq((e as CustomEvent).detail.value)}></mention-input>
        </label>
        ${this.atts.length ? html`<div class="att-row">
          ${this.atts.map((a, i) => html`<span class="att-chip"><img src=${a.data} alt="">${a.name}<button type="button" class="att-x" aria-label="Quitar ${a.name}" @click=${() => { this.atts = this.atts.filter((_, j) => j !== i); }}>×</button></span>`)}
          <span class="muted att-hint">van al change como <code>attachments/</code> — el agente las abre con view</span>
        </div>` : nothing}
        ${this.req.trim() && this.est ? this.planPanel() : nothing}
        <div class="frow">
          <label class="fl" style="flex:1;min-width:10rem" title="Cómo se llamará esta tarea (auto-sugerido a partir de tu descripción; edítalo si quieres).">Nombre<input .value=${this.name} @input=${(e: Event) => { this.name = (e.target as HTMLInputElement).value; this.nameTouched = true; }} placeholder="p.ej. cupon-descuento" pattern="[a-z0-9-]+" required></label>
          <button class="btn" ?disabled=${this.busy} style="align-self:end">${this.busy ? '…' : 'Lanzar run'}</button>
        </div>
        <div class="launch-meta">
          ${this.launchModelSummary()}
          <!-- auto-aprobar FUERA del foco primario (doctrina "el experto manda"): opción secundaria y tenue,
               no un toggle junto al CTA. Por defecto OFF = con pausas de revisión. -->
          <label class="lm-auto ${this.auto ? 'on' : ''}" title="Sin pausas de revisión: el pipeline corre de principio a fin. Por defecto OFF — el experto revisa."><input type="checkbox" aria-label="Auto-aprobar: ejecutar sin pausas de revisión" .checked=${this.auto} @change=${(e: Event) => { this.auto = (e.target as HTMLInputElement).checked; }}>ejecutar sin pausas</label>
          ${this.est ? html`<details class="lm-estd"><summary class="lm-est">≈ ${fmt(this.est.total)} tokens · ${this.est.rows.length} fases <span class="muted">· preflight, sin API</span></summary>
            <table class="est-tab">${this.est.rows.map((r) => html`<tr><td>${r.phase}</td><td>↓ ${fmt(r.estIn)}</td><td>↑ ${fmt(r.estOut)}</td></tr>`)}</table>
            ${this.est.saved > 0 ? html`<p class="est-saved">Ahorro estimado de ${fmt(this.est.saved)} tokens de entrada <span class="muted">(el planner no relee el repositorio)</span></p>` : nothing}
          </details>` : nothing}
        </div>
        ${opts.length ? html`
        <details class="inst-panel" style="margin-top:.6rem">
          <summary class="inst-head">
            <span class="inst-led" aria-hidden="true"></span>
            <span class="inst-title">Modelo por fase</span>
            <span class="inst-sub">${this.preset === 'cost' ? 'Optimizar coste' : this.preset === 'quality' ? 'Máxima calidad' : 'Recomendado'}</span>
            <span class="inst-chev" aria-hidden="true"></span>
          </summary>
          <div class="inst-body">
            <div class="seg-group" role="radiogroup" aria-label="Preajuste de modelo por fase">
              <button type="button" role="radio" aria-checked=${this.preset === 'cost'} class="seg cost ${this.preset === 'cost' ? 'on' : ''}" @click=${() => this.applyPreset('cost')} title="Coder → el modelo LiteLLM más barato · Reviewer → Copilot capaz · Planner → Copilot económico"><span class="seg-led" aria-hidden="true"></span>Optimizar coste</button>
              <button type="button" role="radio" aria-checked=${this.preset === 'quality'} class="seg ${this.preset === 'quality' ? 'on' : ''}" @click=${() => this.applyPreset('quality')} title="Todas las fases con el Copilot más capaz"><span class="seg-led" aria-hidden="true"></span>Máxima calidad</button>
              <button type="button" role="radio" aria-checked=${this.preset === 'clear' || this.preset === ''} class="seg ${this.preset === 'clear' || this.preset === '' ? 'on' : ''}" @click=${() => this.applyPreset('clear')} title="Cada fase usa el modelo recomendado por conductor"><span class="seg-led" aria-hidden="true"></span>Recomendado</button>
            </div>
            <div class="phase-grid">
              ${this.roleSelect('Planner', this.mPlanner, (v) => { this.mPlanner = v; this.preset = ''; })}
              ${this.roleSelect('Coder', this.mCoder, (v) => { this.mCoder = v; this.preset = ''; })}
              ${this.roleSelect('Reviewer', this.mReviewer, (v) => { this.mReviewer = v; this.preset = ''; })}
            </div>
            ${this.mixNote()}
            <!-- B5: defaults en el REPO, la web los cambia — persiste la mezcla en openspec/conductor.json -->
            <div class="frow" style="margin-top:.55rem;align-items:center">
              <button type="button" class="btn sm sec" ?disabled=${this.savingDefaults || !(this.mPlanner || this.mCoder || this.mReviewer)} @click=${() => void this.saveModelsDefault()} title="Escribe esta mezcla en openspec/conductor.json — será el default del EQUIPO para este proyecto (committeable)">${this.savingDefaults ? '…' : '💾 Guardar como default del proyecto'}</button>
              ${this.saveDefaultsMsg ? html`<span class="inst-msg ${this.saveDefaultsMsg.startsWith('✓') ? 'ok' : 'bad'}" role="status" aria-live="polite" style="margin-top:0">${this.saveDefaultsMsg}</span>` : nothing}
            </div>
          </div>
        </details>` : nothing}
        ${this.byokForm()}
      </form>
      ${this.error ? html`<p role="alert" style="color:var(--bad)">${this.error}</p>` : nothing}
    `;
    // GATE DE INIT (coherencia gating==visibilidad): si el proyecto ACTIVO no está inicializado, se muestra el CTA
    // "Inicializar" en vez del formulario — no se ofrece lanzar sobre un proyecto sin gobierno.
    const active = this.projects.find((p) => p.id === this.projId) ?? null;
    const launchSurface = (active && active.openspec === false) ? this.initPanel(active) : launchForm;
    const att = this.attention();
    return html`
      <!-- la home ES tu proyecto: el título lleva su nombre (el texto que no orienta se ha podado; la ruta
           vive en el tooltip del selector y la versión del motor en el pliegue de Métricas) -->
      <div class="apphdr"><h1>${active ? active.name : 'conductor'}</h1></div>
      ${att.length ? html`<div class="attn" role="alert" aria-label="runs que esperan tu decisión">
        ${att.map(({ p, c }) => html`<a class="attn-item" href="/run/${p.id}/${c.name}">⏸ <b>${c.name}</b> espera tu decisión${this.projects.length > 1 ? html` <span class="muted">· 📁 ${p.name}</span>` : nothing}<span class="attn-go">Abrir →</span></a>`)}
      </div>` : nothing}
      <!-- coste "1 cifra en su momento" (decisión de producto): el desglose vive plegado; la cifra oportuna
           va en el estimate del form (al decidir) y en el run (al terminar). AI Credits queda como única señal ambiente. -->
      <details class="launch-fold metrics">
        <summary>📊 Métricas${this.gh ? html` <span class="muted" style="font-weight:500">· AI Credits ${this.gh.used}/${this.gh.entitlement}</span>` : nothing}${this.version ? html` <span class="muted" style="font-weight:500;font-size:.74rem" title="versión del motor en uso">· v${this.version}</span>` : nothing}</summary>
        <div class="cards" style="margin-top:.9rem">
          <div class="card"><small>Runs</small><span>${m.total}</span></div>
          <div class="card ok"><small>Green</small><span>${m.green}</span></div>
          ${m.curso > 0 ? html`<div class="card warn"><small>En curso</small><span>${m.curso}</span></div>` : nothing}
          <div class="card"><small>Tokens entrada ↓</small><span>${fmt(m.tin)}</span></div>
          <div class="card"><small>Tokens salida ↑</small><span>${fmt(m.tout)}</span></div>
          ${this.gh ? html`<div class="card aic"><small>AI Credits</small><span>${this.gh.used}/${this.gh.entitlement}</span><div class="pbar ${this.gh.percentUsed > 80 ? 'warn' : ''}"><i style="width:${Math.min(100, this.gh.percentUsed)}%"></i></div></div>` : nothing}
          ${this.usage ? html`<div class="card"><small>Uso total LiteLLM</small><span>$${this.usage.spend.toFixed(2)}${this.usage.budget ? html` <span class="muted" style="font-size:.8rem;font-weight:500">/ $${this.usage.budget.toFixed(0)}</span>` : nothing}</span>${this.usage.budget ? html`<div class="pbar ${this.usage.spend / this.usage.budget > 0.8 ? 'warn' : ''}"><i style="width:${Math.min(100, (this.usage.spend / this.usage.budget) * 100)}%"></i></div>` : nothing}</div>` : nothing}
        </div>
      </details>

      ${activeItems.length > 0 ? html`
        <h2 class="sect">En curso</h2>
        ${activeItems.map(({ p, c }) => this.runRow(p, c))}
        <details class="launch-fold" style="margin: 1.1rem 0 .3rem">
          <summary>Nueva funcionalidad</summary>
          ${launchSurface}
        </details>
      ` : launchSurface}

      <!-- UN SOLO input de búsqueda en posición estable: al teclear, this.q cambia y el re-render antes
           DESMONTABA el input de "Historial" y MONTABA el de "Búsqueda" (nodos DOM distintos) → se perdía el
           foco tras la 1ª tecla. Ahora el input persiste; solo cambian el título y el contenido de abajo. -->
      ${(doneItems.length > 0 || this.q.trim()) ? html`
        <div class="sectrow">
          <h2 class="sect">${this.q.trim() ? 'Búsqueda' : 'Historial'}</h2>
          <input class="search" type="search" placeholder="Buscar" .value=${this.q} @input=${(e: Event) => this.onSearch(e)} aria-label="buscar runs y cambios archivados">
        </div>
        ${this.q.trim()
          ? html`<p class="muted" style="font-size:.78rem;margin:.2rem 0 .6rem">${this.hits.length} resultado${this.hits.length === 1 ? '' : 's'} para "${this.q}"</p>${this.hits.map((h) => this.hitRow(h))}`
          : doneItems.map(({ p, c }) => this.runRow(p, c))}
      ` : nothing}

      ${m.total === 0 ? html`<p class="muted" style="margin-top:.5rem">Aún no hay runs. Lanza el primero arriba.</p>` : nothing}

      ${this.archived.length ? html`
        <details class="arch">
          <summary>📦 Archivados <span class="muted">· ${this.archived.length}</span></summary>
          ${this.archived.map((a) => html`
            <div class="arch-row">
              <status-pill .verdict=${a.verdict}></status-pill>
              <span class="nm">${a.name}</span>
              ${a.project ? html`<span class="proj">📁 ${a.project}</span>` : nothing}
              <span class="muted">${a.date ?? ''} · ${a.phases} fases · ${a.request}</span>
            </div>`)}
        </details>` : nothing}
    `;
  }

  private hitRow(h: SearchHit): TemplateResult {
    const label = html`<status-pill .verdict=${h.verdict}></status-pill><span class="nm">${h.name}</span>${h.archived ? html`<span class="tag">📦</span>` : nothing}${h.project ? html`<span class="proj">📁 ${h.project}</span>` : nothing}<span class="muted snip">…${h.snippet}…</span>`;
    return html`<div class="hit-row">${h.archived
      ? label
      : html`<a class="hit-main" href="/run/${h.projectId ?? this.defProjId}/${h.name}">${label}</a>`}</div>`;
  }

  // resumen del modelo SOLO cuando se ha elegido uno explícito por fase. Si no se eligió nada,
  // no mostramos ruido: cada fase usa el modelo recomendado y el resumen quedaría vacío/confuso.
  private launchModelSummary(): TemplateResult | typeof nothing {
    const lbl = (v: string): string => v.replace(/^(byok|copilot):/, '');
    const all = [this.mPlanner, this.mCoder, this.mReviewer];
    if (!all.some(Boolean)) return nothing;
    const txt = all.every((v) => v === all[0])
      ? lbl(all[0])
      : `planner ${lbl(this.mPlanner) || '—'} · coder ${lbl(this.mCoder) || '—'} · reviewer ${lbl(this.mReviewer) || '—'}`;
    return html`<span class="lm-model" title="modelo elegido por fase — cámbialo en «Modelo por fase»">Modelo: <b>${txt}</b></span>`;
  }

  // coherencia multi-proveedor: si los modelos por fase abarcan >1 proveedor, hace VISIBLE el reparto de
  // coste (pilar mezcla qwen/Copilot). Determinista, sin LLM, client-side. Solo aparece si hay mezcla real.
  private mixNote(): TemplateResult | typeof nothing {
    const prov = (s: string): string => !s ? '' : s.startsWith('byok:') ? 'LiteLLM' : s.startsWith('copilot:') ? 'Copilot' : 'sesión';
    const set = [...new Set([this.mPlanner, this.mCoder, this.mReviewer].map(prov).filter(Boolean))];
    if (set.length < 2) return nothing;
    return html`<div class="muted" style="font-size:.72rem;margin-top:.5rem">proveedores: ${set.join(' + ')}</div>`;
  }

  // muestra Copilot (catálogo, siempre) + BYOK SIEMPRE (opciones deshabilitadas si no hay credenciales) →
  // descubribilidad sin configurar nada antes; estado por affordance (disabled), sin texto explicativo.
  private roleSelect(label: string, value: string, set: (v: string) => void): TemplateResult {
    const m = this.models;
    const cop = m?.copilot ?? [];
    const byok = m?.byok ?? [];
    const creds = !!m?.byokCreds;
    // agrupa los modelos Copilot por familia (Claude/GPT/Gemini) → picker de 18 escaneable, más nuevos arriba
    const fam = (o: string): string => o.startsWith('claude') ? 'Claude' : o.startsWith('gpt') ? 'GPT' : o.startsWith('gemini') ? 'Gemini' : 'Otros';
    const groups = (['Claude', 'GPT', 'Gemini', 'Otros'] as const)
      .map((g) => [g, cop.filter((o) => fam(o) === g).sort((a, b) => b.localeCompare(a))] as const)
      .filter(([, xs]) => xs.length);
    // HONESTIDAD del catálogo: si el CLI aún no reportó su lista real, se declara (· vistos en tus runs)
    // y jamás se rellena con modelos inventados; sin nada observado, el estado vacío lo dice claro.
    const pend = m?.copilotPending;
    return html`<label class="fl" style="flex:1">${label}<select .value=${value} title=${m ? `Copilot: ${m.copilotSource} · LiteLLM: ${m.byokSource}` : ''} @change=${(e: Event) => set((e.target as HTMLSelectElement).value)}>
      <option value="">Recomendado (conductor elige)</option>
      ${groups.length ? groups.map(([g, xs]) => html`<optgroup label="Copilot · ${g}${pend ? ' · vistos en tus runs' : ''}">${xs.map((o) => html`<option value="copilot:${o}">${o}</option>`)}</optgroup>`) : html`<option value="" disabled>catálogo Copilot aún no disponible</option>`}
      ${creds && byok.length ? html`<optgroup label="LiteLLM">${byok.map((o) => html`<option value="byok:${o}">${m?.names?.[o] ?? o}</option>`)}</optgroup>` : nothing}
    </select></label>`;
  }

  private runRow(p: ProjectSummary, c: ChangeSummary): TemplateResult {
    return html`
      <div class="run-row ${verdictClass(c.verdict) === 'CURSO' ? 'run-active' : ''}">
        <div class="run-l">
          <a class="main" href="/run/${p.id}/${c.name}">
            <span class="nm">${c.name} <status-pill .verdict=${c.pending ? 'EN PAUSA' : c.verdict}></status-pill>${c.pending ? html`<span class="pill CURSO" title="el run espera tu revisión">⏸ tu decisión</span>` : nothing}</span>
            <span class="rq">${c.request}</span>
            <span class="proj">📁 ${p.name}</span>
          </a>
          <div class="run-foot">
            <span class="meta">${c.phases} fases${(c.tokens?.in ?? 0) + (c.tokens?.out ?? 0) > 0 ? html` · ↓ ${fmt(c.tokens?.in)} entrada · ↑ ${fmt(c.tokens?.out)} salida` : nothing}</span>
            ${c.resumable ? html`<button class="btn sm resume" @click=${() => void this.resume(p, c)} aria-label="reanudar ${c.name}">⏯ Reanudar</button>` : nothing}
            ${!c.resumable && verdictClass(c.verdict) !== 'CURSO' && c.request ? html`<button class="btn sm sec" @click=${() => this.reuse(c)} title="rellena el formulario con esta petición para lanzar una variante">↺ Reutilizar</button>` : nothing}
            ${c.hasDashboard ? html`<a class="btn sm dash" href="/artifact/${p.id}/${c.name}/dashboard.html" target="_blank" aria-label="informe de ${c.name}">📊 Informe</a>` : nothing}
            ${c.phases > 0 ? html`<a class="btn sm aiact" href="/api/run/${p.id}/${c.name}/aiact" target="_blank" aria-label="AI Act de ${c.name}">🛡 AI Act</a>` : nothing}
          </div>
        </div>
        <a class="run-open" href="/run/${p.id}/${c.name}" tabindex="-1" aria-hidden="true"><span class="chev" aria-hidden="true"></span></a>
      </div>`;
  }
}

declare global { interface HTMLElementTagNameMap { 'panel-screen': PanelScreen; } }
