// Cliente HTTP tipado contra el contrato REAL del motor. apiBase inyectable: '/api/' para el panel,
// '/api/run/<projId>/<change>/' para un run, '/api/demo/' para el showcase. Cero LLM aquí (token-first).
import type { ChangesResponse, ModelsResponse, RunState, LaunchBody, ContinueBody, ApiResult, EstimateResponse, SearchResponse, ArchiveResponse, SessionEvents, RunFiles } from './types';

export class ConductorApi {
  constructor(public apiBase = '/api/') {}

  private async getJson<T>(path: string): Promise<T> {
    const r = await fetch(this.apiBase + path);
    if (!r.ok) throw new Error(`GET ${this.apiBase}${path} → ${r.status}`);
    return (await r.json()) as T;
  }
  private async post<T = ApiResult>(path: string, body?: unknown): Promise<T> {
    const r = await fetch(this.apiBase + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    return (await r.json().catch(() => ({}))) as T;
  }
  private async getText(path: string): Promise<string> {
    const r = await fetch(this.apiBase + path);
    return r.text();
  }

  // ── panel (base '/api/') ──
  changes(): Promise<ChangesResponse> { return this.getJson<ChangesResponse>('changes'); }
  models(): Promise<ModelsResponse> { return this.getJson<ModelsResponse>('models'); }
  // El usuario NO clasifica: el servidor propone el tipo y deriva las fases. `pipeline` solo se envía si el
  // experto tocó los checkboxes de fases → el estimate (tokens + acciones) refleja EXACTO las fases elegidas.
  estimate(request: string, pipeline?: string[]): Promise<EstimateResponse> {
    return this.getJson<EstimateResponse>('estimate?request=' + encodeURIComponent(request.slice(0, 4000)) + (pipeline && pipeline.length ? '&pipeline=' + encodeURIComponent(pipeline.join(',')) : ''));
  }
  launch(body: LaunchBody): Promise<ApiResult> { return this.post('launch', body); }
  // inicializa SDD en un proyecto desde la web (crea openspec/): hace alcanzable el flujo sin volver a la terminal.
  init(projectId?: string): Promise<ApiResult> { return this.post('init', projectId ? { projectId } : {}); }
  resumeNamed(name: string, projectId?: string): Promise<ApiResult> { return this.post('resume', { name, projectId }); }
  search(q: string): Promise<SearchResponse> { return this.getJson<SearchResponse>('search?q=' + encodeURIComponent(q)); }
  archive(): Promise<ArchiveResponse> { return this.getJson<ArchiveResponse>('archive'); }

  // ── run (base '/api/run/<id>/<change>/') ──
  state(): Promise<RunState> { return this.getJson<RunState>('state'); }
  continue(body: ContinueBody): Promise<ApiResult> { return this.post('continue', body); }
  stop(): Promise<ApiResult> { return this.post('stop'); }
  resume(): Promise<ApiResult> { return this.post('resume'); }
  rollback(phase: string): Promise<ApiResult> { return this.post('rollback', { phase }); }
  // cierra el happy path: promueve la spec (delta aditivo) y mueve el change a archive/ — solo con GREEN
  archiveRun(): Promise<ApiResult & { promoted?: string[]; needsManualMerge?: string[]; archivedDir?: string }> { return this.post('archive'); }
  artifact(p: string): Promise<string> { return this.getText('artifact?p=' + encodeURIComponent(p)); }
  saveArtifact(p: string, content: string): Promise<ApiResult> { return this.post('artifact', { p, content }); }
  diff(p: string): Promise<string> { return this.getText('diff?p=' + encodeURIComponent(p)); }
  // resumen de cambios del run (experiencia Git): changeset real vs HEAD
  runFiles(): Promise<RunFiles> { return this.getJson<RunFiles>('files'); }
  raw(phase: string): Promise<string> { return this.getText('raw?phase=' + encodeURIComponent(phase)); }
  // ── visor de sesión (events.jsonl) ──
  events(opts: { cat?: string[]; q?: string; limit?: number; offset?: number } = {}): Promise<SessionEvents> {
    const p = new URLSearchParams();
    if (opts.cat?.length) p.set('cat', opts.cat.join(','));
    if (opts.q) p.set('q', opts.q);
    if (opts.limit) p.set('limit', String(opts.limit));
    if (opts.offset) p.set('offset', String(opts.offset));
    const qs = p.toString();
    return this.getJson<SessionEvents>('events' + (qs ? '?' + qs : ''));
  }
}
