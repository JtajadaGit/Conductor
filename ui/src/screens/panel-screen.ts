import { html, nothing, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { CElement } from '../core/element';
import { ConductorApi } from '../api/client';
import { router } from '../router';
import type { ProjectSummary, ChangeSummary, ModelsResponse, ModelsByRole, GhUsage, Usage, SearchHit, ArchiveEntry, PhaseEstimate, PlanCheck } from '../api/types';
import { fmt, kebab, verdictClass } from '../lib/format';
import '../components/status-pill';

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
  @state() private showAll = false; // foco: solo el proyecto activo (default) vs agregado global ("ver todos")
  @state() private error = '';
  @state() private byokUrl = '';
  @state() private byokKey = '';
  @state() private byokSaving = false;
  @state() private byokMsg = '';
  @state() private est: { total: number; rows: PhaseEstimate[]; saved: number; actions: string[]; checks: PlanCheck[]; testCmd: string | null } | null = null;
  @state() private phaseSel: string[] = []; // fases SDD marcadas en los checkboxes — fuente de verdad de la selección
  @state() private runTests = false; // toggle "test": ejecutar las pruebas REALES del proyecto tras el gate (opcional, no es fase)
  @state() private initBusy = false; // inicializando el proyecto activo desde la web
  private initMsg = '';
  private pipelineTouched = false; // el experto tocó los checkboxes → el pipeline elegido MANDA (se envía al lanzar y al estimar)
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
      this.projects = d.projects ?? [];
      this.gh = d.ghUsage ?? null;
      this.usage = d.usage ?? null;
      // PROYECTO ACTIVO por ID ESTABLE (no por nombre — dos repos con el mismo basename ya no colisionan, #9).
      const served = d.projectId || this.projects.find((p) => p.name === d.project)?.id || this.projects[0]?.id || '';
      this.defProjId = served;
      // SOLO en la 1ª carga fijamos el activo: URL ?project= (de `conductor serve B`) > último visto > el servido.
      // Después respetamos la elección del usuario (no se resetea en cada poll de 5s).
      if (!this.projIdInit) {
        const valid = (id: string | null): boolean => !!id && this.projects.some((p) => p.id === id);
        let fromUrl: string | null = null; try { fromUrl = new URLSearchParams(location.search).get('project'); } catch { /* sin location */ }
        let fromStore: string | null = null; try { fromStore = localStorage.getItem('conductor.activeProject'); } catch { /* sin storage */ }
        this.projId = [fromUrl, fromStore, served].find((id) => valid(id)) || served;
        this.projIdInit = true;
        this.persistActive();
      }
    } catch { /* conserva el último dato bueno */ }
  }
  private projIdInit = false; // el activo se fija una vez (no se pisa en cada refresh)
  private persistActive(): void { try { if (this.projId) localStorage.setItem('conductor.activeProject', this.projId); } catch { /* sin storage */ } }

  private nameTouched = false; // el usuario editó el nombre a mano → dejamos de auto-rellenarlo desde la descripción
  private onReq(e: Event): void {
    this.req = (e.target as HTMLTextAreaElement).value;
    // auto-nombre: SIGUE a la descripción mientras el usuario no lo haya tocado (antes se bloqueaba en la 1ª letra
    // porque la condición era `!this.name`, que se vuelve falsa tras el primer carácter).
    if (!this.nameTouched) this.name = kebab(this.req.split(/\s+/).slice(0, 6).join(' '));
    this.scheduleEstimate();
  }
  // coste visible en el punto de decisión: estima tokens (preflight, sin API) con debounce
  private scheduleEstimate(): void {
    if (this.estTimer) clearTimeout(this.estTimer);
    this.estTimer = setTimeout(() => void this.fetchEstimate(), 350);
  }
  private async fetchEstimate(): Promise<void> {
    if (!this.req.trim()) { this.est = null; this.phaseSel = []; this.pipelineTouched = false; this.runTests = false; return; }
    try {
      // El usuario NO clasifica: pedimos el PLAN por la petición. El servidor (resolvePlan) devuelve las ACCIONES
      // que se harán + las COMPROBACIONES que se activan por contenido (cada una con su porqué) + la complejidad
      // interna que el motor ejecutará. Si el experto tocó los checkboxes, mandamos ese pipeline → el estimate
      // (tokens + acciones) refleja EXACTO las fases elegidas (estimate == run). El plan MOSTRADO == el LANZADO.
      const e = await this.api.estimate(this.req, this.pipelineTouched ? this.effectivePipeline() : undefined);
      this.est = { total: e.total, rows: e.phases, saved: e.noRescanSaved, actions: e.actions ?? [], checks: e.checks ?? [], testCmd: e.testCmd ?? null };
      this.complexity = e.complexity || this.complexity; // profundidad interna derivada del contenido (nunca se muestra como talla)
      // SISTEMA PROPONE, EXPERTO MANDA: mientras no toque los checkboxes, la selección SIGUE al plan derivado.
      if (!this.pipelineTouched) this.phaseSel = e.phases.map((r) => r.phase);
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
    this.phaseSel = (this.est?.rows ?? []).map((r) => r.phase);
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
      });
      if (r.ok && r.url) { router.go(r.url); return; }
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
      <div class="launch-init" style="padding:1rem 1.1rem;border:1px solid var(--bd);border-left:3px solid var(--accent);border-radius:8px;background:var(--accentbg);color:var(--tx)">
        <h2 style="margin:0 0 .3rem;font-size:1rem;font-weight:600">Este proyecto no está inicializado</h2>
        <p class="muted" style="margin:0 0 .25rem;font-size:.86rem"><strong style="font-weight:600">${active.name}</strong> aún no tiene SDD configurado. Inicialízalo para poder lanzar features con gobierno (spec · apply · verify).</p>
        <p class="muted" style="margin:0 0 .7rem;font-size:.78rem">Crea <code>openspec/</code> con la config del pipeline, el esquema y <code>.copilotignore</code> (ahorro de tokens). No toca tu código.</p>
        <button class="btn" ?disabled=${this.initBusy} @click=${() => void this.doInit()}>${this.initBusy ? 'Inicializando…' : 'Inicializar este proyecto'}</button>
        ${this.initMsg ? html`<p style="margin:.55rem 0 0;font-size:.82rem;color:var(--bad)">${this.initMsg}</p>` : nothing}
      </div>`;
  }

  private async resume(p: ProjectSummary, c: ChangeSummary): Promise<void> {
    const r = await this.api.resumeNamed(c.name, p.id);
    if (r.ok && r.url) router.go(r.url);
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
    if (this.showAll) return this.projects;
    const a = this.activeProject();
    return a ? [a] : this.projects;
  }

  // proyectos REALES en el selector: solo los que tienen sdd-init hecho (openspec/). Sin sdd-init no hay
  // pipeline que lanzar, así que no aparecen — evita confusión (p.ej. el repo de dev sin inicializar).
  private sddProjects(): ProjectSummary[] { return this.projects.filter((p) => p.openspec); }

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
  // (la fase que más tokens gasta) va a qwen/BYOK gratis, el Reviewer (gate innegociable) a un Copilot
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
      // Coder = el BYOK más BARATO por tier (qwen económico antes que un sonnet-vía-byok), no el alfabético
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

  private async byokSave(e: Event): Promise<void> {
    e.preventDefault();
    // la URL se mete UNA vez: si ya hay una guardada (o env), reusarla y solo pedir la key nueva
    const url = (this.byokUrl || this.models?.byokUrl || '').trim();
    const key = this.byokKey.trim();
    if (!url || !key) return;
    this.byokSaving = true; this.byokMsg = '';
    try {
      const r = await fetch('/api/byok/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, key }) });
      const j = await r.json() as { ok: boolean; error?: string };
      if (j.ok) { this.byokMsg = '✓ Guardado'; this.byokKey = ''; this.models = null; try { this.models = await this.api.models(); } catch {} }
      else this.byokMsg = j.error ?? 'Error al guardar';
    } catch (err) {
      // distingue fallo de RED (servidor caído/timeout) de un error de validación del servidor
      const e = err as Error;
      this.byokMsg = e instanceof TypeError ? 'No se pudo conectar con el servidor local. Comprueba que la aplicación está en ejecución.' : String(e.message);
    }
    finally { this.byokSaving = false; }
  }

  private byokHost(): string {
    const u = this.models?.byokUrl || this.byokUrl;
    try { return new URL(u).host; } catch { return u || 'LiteLLM'; }
  }

  private byokForm(): TemplateResult {
    const connected = !!this.models?.byokCreds;
    // el color (verde/rojo) comunica el resultado; quitamos el ✓ del texto. aria-live para lectores.
    const msg = this.byokMsg ? html`<div class="inst-msg ${this.byokMsg.startsWith('✓') ? 'ok' : 'bad'}" role="status" aria-live="polite">${this.byokMsg.replace(/^✓\s*/, '')}</div>` : nothing;
    if (connected) {
      // CONECTADO = readout de instrumento: LED verde + pill "Conectado" + pares clave→valor. La key ya está
      // guardada (cifrada en ~/.conductor/byok.json) o detectada del entorno; solo se cambia si caduca.
      return html`
        <details class="inst-panel" style="margin-top:.6rem">
          <summary class="inst-head">
            <span class="inst-led on-ok" aria-hidden="true"></span>
            <span class="inst-title">qwen · LiteLLM</span>
            <span class="inst-status ok">Conectado</span>
            <span class="inst-chev" aria-hidden="true"></span>
          </summary>
          <div class="inst-body">
            <dl class="readout">
              <div class="ro-row"><dt>Proveedor</dt><dd>${this.byokHost()}</dd></div>
              <div class="ro-row"><dt>Credencial</dt><dd>Cifrada en tu equipo (DPAPI)</dd></div>
              <div class="ro-row"><dt>Privacidad</dt><dd>Nunca sale de tu máquina · no se registra</dd></div>
            </dl>
            <p class="inst-note">La clave se guarda <strong>cifrada con DPAPI</strong> (solo tu usuario de Windows puede descifrarla) en <code>~/.conductor/byok.json</code>. <strong>Nunca sale de tu equipo</strong>, no aparece en logs ni en comandos, y no se cachea — solo se guardan los nombres de los modelos. Se mantiene entre sesiones; cámbiala solo si caduca.</p>
            <form class="frow" style="align-items:end" @submit=${(e: Event) => void this.byokSave(e)}>
              <label class="fl" style="flex:2;min-width:12rem">Nueva API Key<input type="password" .value=${this.byokKey} @input=${(e: Event) => { this.byokKey = (e.target as HTMLInputElement).value; }} placeholder="sk-… (solo si caducó)" autocomplete="off"></label>
              <button class="btn sm sec" ?disabled=${this.byokSaving || !this.byokKey.trim()} style="align-self:end">${this.byokSaving ? '…' : 'Actualizar clave'}</button>
            </form>
            ${msg}
          </div>
        </details>`;
    }
    // SIN conectar = LED ámbar (pendiente) + invitación con acento lateral. La URL se prefilla si la conocemos.
    return html`
      <details class="inst-panel inst-prompt" style="margin-top:.6rem">
        <summary class="inst-head">
          <span class="inst-led on-warn" aria-hidden="true"></span>
          <span class="inst-title">Conectar qwen · LiteLLM</span>
          <span class="inst-status warn">Configuración única</span>
          <span class="inst-chev" aria-hidden="true"></span>
        </summary>
        <div class="inst-body">
          <p class="inst-note">Conecta tu proxy LiteLLM <strong>una sola vez</strong> para usar qwen (más barato) en las fases que elijas. La clave se guarda <strong>cifrada con DPAPI</strong> en tu equipo (solo tu usuario la descifra), <strong>nunca sale de tu máquina</strong>, no se registra ni se cachea (solo los nombres de modelos). No la vuelves a meter.</p>
          <form class="frow" style="align-items:end" @submit=${(e: Event) => void this.byokSave(e)}>
            <label class="fl" style="flex:2;min-width:12rem">URL LiteLLM<input type="url" .value=${this.byokUrl} @input=${(e: Event) => { this.byokUrl = (e.target as HTMLInputElement).value; }} placeholder="https://…/v1" required></label>
            <label class="fl" style="flex:2;min-width:10rem">API Key<input type="password" .value=${this.byokKey} @input=${(e: Event) => { this.byokKey = (e.target as HTMLInputElement).value; }} placeholder="sk-…" autocomplete="off" required></label>
            <button class="btn sm" ?disabled=${this.byokSaving} style="align-self:end">${this.byokSaving ? '…' : 'Guardar'}</button>
          </form>
          ${msg}
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
          <label style="display:flex;align-items:center;gap:.45rem;cursor:${this.est?.testCmd ? 'pointer' : 'not-allowed'};${this.est?.testCmd ? '' : 'opacity:.5'}" title=${this.est?.testCmd ? 'Ejecuta las pruebas REALES del proyecto DESPUÉS del gate (no es una fase SDD). Si fallan → veredicto TESTS-FAIL.' : 'No se detectó comando de pruebas en este proyecto'}>
            <input type="checkbox" .checked=${this.runTests} ?disabled=${!this.est?.testCmd} @change=${(ev: Event) => { this.runTests = (ev.target as HTMLInputElement).checked; }} aria-label="ejecutar las pruebas del proyecto tras el gate (opcional)">
            <strong style="font-weight:600">test</strong>
            ${this.est?.testCmd ? html`<span class="muted" style="font-weight:400">→ ejecutar pruebas del proyecto · <code style="font-size:.85em">${this.est.testCmd}</code></span>` : html`<span class="muted" style="font-weight:400">→ sin comando de pruebas detectado</span>`}
          </label>
          <p class="muted" style="margin:.1rem 0 0 1.55rem;font-size:.72rem">Opcional · corre TRAS el gate (no es una fase). Si fallan → veredicto propio TESTS-FAIL.</p>
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
        <label class="fl">Qué quieres construir
          <textarea rows="3" placeholder="Describe el cambio en una frase o pega una especificación completa" .value=${this.req} @input=${(e: Event) => this.onReq(e)} required></textarea>
        </label>
        ${this.req.trim() && this.est ? this.planPanel() : nothing}
        <div class="frow">
          ${this.sddProjects().length > 1 ? html`<label class="fl">Proyecto<select .value=${this.projId} @change=${(e: Event) => { this.projId = (e.target as HTMLSelectElement).value; this.persistActive(); }}>
            ${this.sddProjects().map((p) => html`<option value=${p.id}>${p.name}</option>`)}
          </select></label>` : nothing}
          <label class="fl" style="flex:1;min-width:10rem" title="Cómo se llamará esta tarea (auto-sugerido a partir de tu descripción; edítalo si quieres).">Nombre<input .value=${this.name} @input=${(e: Event) => { this.name = (e.target as HTMLInputElement).value; this.nameTouched = true; }} placeholder="p.ej. cupon-descuento" pattern="[a-z0-9-]+" required></label>
          <label class="fl" title="Sin pausas de revisión: el pipeline corre de principio a fin sin pedirte aprobar cada fase (el experto suele quererlo OFF)">Auto-aprobar<label class="switch"><input type="checkbox" aria-label="Auto-aprobar: ejecutar sin pausas de revisión" .checked=${this.auto} @change=${(e: Event) => { this.auto = (e.target as HTMLInputElement).checked; }}><span></span></label></label>
          <button class="btn" ?disabled=${this.busy} style="align-self:end">${this.busy ? '…' : 'Lanzar run'}</button>
        </div>
        <div class="launch-meta">
          ${this.launchModelSummary()}
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
              <button type="button" role="radio" aria-checked=${this.preset === 'cost'} class="seg cost ${this.preset === 'cost' ? 'on' : ''}" @click=${() => this.applyPreset('cost')} title="Coder → qwen (más barato, vía LiteLLM) · Reviewer → Copilot capaz · Planner → Copilot económico"><span class="seg-led" aria-hidden="true"></span>Optimizar coste</button>
              <button type="button" role="radio" aria-checked=${this.preset === 'quality'} class="seg ${this.preset === 'quality' ? 'on' : ''}" @click=${() => this.applyPreset('quality')} title="Todas las fases con el Copilot más capaz"><span class="seg-led" aria-hidden="true"></span>Máxima calidad</button>
              <button type="button" role="radio" aria-checked=${this.preset === 'clear' || this.preset === ''} class="seg ${this.preset === 'clear' || this.preset === '' ? 'on' : ''}" @click=${() => this.applyPreset('clear')} title="Cada fase usa el modelo recomendado por conductor"><span class="seg-led" aria-hidden="true"></span>Recomendado</button>
            </div>
            <div class="phase-grid">
              ${this.roleSelect('Planner', this.mPlanner, (v) => { this.mPlanner = v; this.preset = ''; })}
              ${this.roleSelect('Coder', this.mCoder, (v) => { this.mCoder = v; this.preset = ''; })}
              ${this.roleSelect('Reviewer', this.mReviewer, (v) => { this.mReviewer = v; this.preset = ''; })}
            </div>
            ${this.mixNote()}
          </div>
        </details>` : nothing}
        ${this.byokForm()}
      </form>
      ${this.error ? html`<p style="color:var(--bad)">${this.error}</p>` : nothing}
    `;
    // GATE DE INIT (coherencia gating==visibilidad): si el proyecto ACTIVO no está inicializado, se muestra el CTA
    // "Inicializar" en vez del formulario — no se ofrece lanzar sobre un proyecto sin gobierno.
    const active = this.projects.find((p) => p.id === this.projId) ?? null;
    const launchSurface = (active && active.openspec === false) ? this.initPanel(active) : launchForm;
    return html`
      <div class="apphdr"><h1>Dashboard</h1></div>
      <p class="muted" style="margin:-.9rem 0 1.3rem;font-size:.82rem">
        ${active ? html`Proyecto activo: <strong style="font-weight:600;color:var(--tx)">${active.name}</strong> <span style="opacity:.7">· ${active.root}</span>` : html`${this.projects.length} proyecto${this.projects.length === 1 ? '' : 's'}`}
        ${this.projects.length > 1 ? html` · <button type="button" @click=${() => { this.showAll = !this.showAll; }} style="background:none;border:none;padding:0;font:inherit;color:var(--accent);cursor:pointer;text-decoration:underline">${this.showAll ? 'ver solo este' : `ver todos (${this.projects.length})`}</button>` : nothing}
        · ${m.total} run${m.total === 1 ? '' : 's'}${this.showAll ? ' · todos' : ''}
      </p>
      <div class="cards">
        <div class="card"><small>Runs</small><span>${m.total}</span></div>
        <div class="card ok"><small>Green</small><span>${m.green}</span></div>
        ${m.curso > 0 ? html`<div class="card warn"><small>En curso</small><span>${m.curso}</span></div>` : nothing}
        <div class="card"><small>Tokens entrada ↓</small><span>${fmt(m.tin)}</span></div>
        <div class="card"><small>Tokens salida ↑</small><span>${fmt(m.tout)}</span></div>
        ${this.gh ? html`<div class="card aic"><small>AI Credits</small><span>${this.gh.used}/${this.gh.entitlement}</span><div class="pbar ${this.gh.percentUsed > 80 ? 'warn' : ''}"><i style="width:${Math.min(100, this.gh.percentUsed)}%"></i></div></div>` : nothing}
        ${this.usage ? html`<div class="card"><small>Uso total qwen</small><span>$${this.usage.spend.toFixed(2)}${this.usage.budget ? html` <span class="muted" style="font-size:.8rem;font-weight:500">/ $${this.usage.budget.toFixed(0)}</span>` : nothing}</span>${this.usage.budget ? html`<div class="pbar ${this.usage.spend / this.usage.budget > 0.8 ? 'warn' : ''}"><i style="width:${Math.min(100, (this.usage.spend / this.usage.budget) * 100)}%"></i></div>` : nothing}</div>` : nothing}
      </div>

      ${activeItems.length > 0 ? html`
        <h2 class="sect">En curso</h2>
        ${activeItems.map(({ p, c }) => this.runRow(p, c))}
        <details class="launch-fold" style="margin: 1.1rem 0 .3rem">
          <summary>Nueva funcionalidad</summary>
          ${launchSurface}
        </details>
      ` : launchSurface}

      ${!this.q.trim() && doneItems.length > 0 ? html`
        <div class="sectrow">
          <h2 class="sect">Historial</h2>
          <input class="search" type="search" placeholder="Buscar" .value=${this.q} @input=${(e: Event) => this.onSearch(e)} aria-label="buscar runs y cambios archivados">
        </div>
        ${doneItems.map(({ p, c }) => this.runRow(p, c))}
      ` : nothing}

      ${this.q.trim() ? html`
        <div class="sectrow" style="margin-top:.8rem">
          <h2 class="sect">Búsqueda</h2>
          <input class="search" type="search" placeholder="Buscar" .value=${this.q} @input=${(e: Event) => this.onSearch(e)} aria-label="buscar runs y cambios archivados">
        </div>
        <p class="muted" style="font-size:.78rem;margin:.2rem 0 .6rem">${this.hits.length} resultado${this.hits.length === 1 ? '' : 's'} para "${this.q}"</p>
        ${this.hits.map((h) => this.hitRow(h))}
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
    const prov = (s: string): string => !s ? '' : s.startsWith('byok:') ? 'qwen' : s.startsWith('copilot:') ? 'Copilot' : 'sesión';
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
    return html`<label class="fl" style="flex:1">${label}<select .value=${value} @change=${(e: Event) => set((e.target as HTMLSelectElement).value)}>
      <option value="">Recomendado (conductor elige)</option>
      ${groups.map(([g, xs]) => html`<optgroup label="Copilot · ${g}">${xs.map((o) => html`<option value="copilot:${o}">${o}</option>`)}</optgroup>`)}
      ${creds && byok.length ? html`<optgroup label="qwen · LiteLLM">${byok.map((o) => html`<option value="byok:${o}">${o}</option>`)}</optgroup>` : nothing}
    </select></label>`;
  }

  private runRow(p: ProjectSummary, c: ChangeSummary): TemplateResult {
    return html`
      <div class="run-row ${verdictClass(c.verdict) === 'CURSO' ? 'run-active' : ''}">
        <div class="run-l">
          <a class="main" href="/run/${p.id}/${c.name}">
            <span class="nm">${c.name} <status-pill .verdict=${c.verdict}></status-pill></span>
            <span class="rq">${c.request}</span>
            <span class="proj">📁 ${p.name}</span>
          </a>
          <div class="run-foot">
            <span class="meta">${c.phases} fases · ↓ ${fmt(c.tokens?.in)} entrada · ↑ ${fmt(c.tokens?.out)} salida</span>
            ${c.resumable ? html`<button class="btn sm resume" @click=${() => void this.resume(p, c)} aria-label="reanudar ${c.name}">⏯ Reanudar</button>` : nothing}
            ${c.hasDashboard ? html`<a class="btn sm dash" href="/artifact/${p.id}/${c.name}/dashboard.html" target="_blank" aria-label="dashboard de ${c.name}">📊 Dashboard</a>` : nothing}
            ${c.phases > 0 ? html`<a class="btn sm aiact" href="/api/run/${p.id}/${c.name}/aiact" target="_blank" aria-label="AI Act de ${c.name}">🛡 AI Act</a>` : nothing}
          </div>
        </div>
        <a class="run-open" href="/run/${p.id}/${c.name}" tabindex="-1" aria-hidden="true"><span class="chev" aria-hidden="true"></span></a>
      </div>`;
  }
}

declare global { interface HTMLElementTagNameMap { 'panel-screen': PanelScreen; } }
