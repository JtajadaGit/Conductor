// Tipos del contrato HTTP REAL del motor (serve.mjs). Fieles a runState()/listChanges()/availableModels().
// TS estricto: modelar opcionales/nullables como son (no no-null asserts) para no ocultar estados reales.

export type Verdict = string | null; // 'GREEN' | 'NOT-GREEN' | 'ABORTED' | 'STOPPED' | 'BLOCKED' | 'EN CURSO' | ...

export type FileKind = 'create' | 'edit' | 'delete';
export interface FileChange { p: string; k: FileKind; }
// resumen de cambios del run (experiencia Git): fichero + tipo + líneas +/− (null si binario/sin git)
export interface ChangedFile { p: string; k: FileKind; added: number | null; removed: number | null; }
export interface RunFiles { files: ChangedFile[]; totals: { files: number; added: number; removed: number }; fromGit: boolean; }
export interface Tokens { in: number; out: number; }

export interface Phase {
  phase: string;
  role: string;
  model: string | null;
  modelRequested?: string | null;
  modelReported?: string | null;
  modelMismatch?: boolean;
  provider?: string | null;
  attempts: number;
  ms: number;
  tokens: Tokens | null;
  files: FileChange[];
  ok: boolean;
  lastError?: string | null;
  lenses?: string[];
  resumed?: boolean;
  hasRaw?: boolean;
  context?: { instructions: string[]; contextFiles: string[] };
}

export interface CurrentPhase {
  phase: string;
  role: string;
  model: string | null;
  provider?: string | null;
  attempt: number;
  maxAttempts: number;
  startedAt: number;
  timeoutMs: number;
  lastError?: string | null;
  lastActivity?: string | null; // última acción REAL del agente (tool × ruta) — la barra deja de ser solo reloj
}

export interface DecisionFinding { message: string; severity?: string; file?: string; }
// findings: string (compat con estados viejos/mock) u objeto estructurado (severidad + fichero del hallazgo del gate)
export interface PendingDecision { before: string; role: string; findings?: Array<string | DecisionFinding>; }
export interface Approval { phase: string; at: string; via: string; note?: boolean; }

export interface CostEntry { in: number; out: number; phases: number; }
export interface Cost { byModel: Record<string, CostEntry>; }

export interface Savings {
  copilot_phases: number; byok_phases: number; // fases Copilot (consumen AIC) vs LiteLLM/BYOK (0 AIC)
  byok_in: number; byok_out: number; copilot_in: number; copilot_out: number; // tokens por lado (BYOK → LiteLLM)
}
export interface Usage { spend: number; budget: number; runDelta: number; }
export interface GhUsage { plan: string; used: number; entitlement: number; percentUsed: number; reset: string; overage?: boolean; }

export interface RunState {
  project: string;
  branch: string | null;
  cost: Cost | null;
  savings: Savings | null;
  live: FileChange[];
  logTail: string[];
  modelOptions: string[];
  verifyExcerpt: string | null;
  verdict: Verdict;
  reason: string | null; // porqué humano del verdict terminal (BLOCKED/ABORTED/STOPPED) — se pinta bajo la pill
  request: string;
  complexity: string;
  resumed: boolean;
  total_ms: number | null;
  phases: Phase[];
  plan: string[];
  current: CurrentPhase | null;
  now: number;
  done: boolean;
  hasDashboard: boolean;
  alive?: boolean;
  pending: PendingDecision | null;
  approvals?: Approval[];
  usage: Usage | null;
  ghUsage: GhUsage | null;
  stopRequested: boolean;
  tests?: TestRun | null; // verify por ejecución (opcional): pruebas reales del proyecto corridas tras el gate
}

// resultado de la fase "test" (opcional, antes de verify). Si !passed → ciclo fix → re-test → BLOCKED si no converge.
export interface TestRun { ran: boolean; passed: boolean; failed: string[]; cmds: string[]; }

export interface ChangeSummary {
  name: string;
  request: string;
  verdict: Verdict;
  phases: number;
  complexity: string;
  tokens: Tokens;
  url: string | null;
  hasDashboard: boolean;
  resumable: boolean;
  mtime: number;
  pending?: boolean; // true ⇔ el run espera una decisión humana AHORA (el panel/sidebar lo señalan)
}

export interface ProjectSummary {
  id: string;
  name: string;
  root: string;
  openspec?: boolean;
  changes: ChangeSummary[];
}

export interface ChangesResponse {
  project: string;
  projectId?: string; // ID ESTABLE del proyecto servido (el panel fija el activo por ID, no por nombre)
  version?: string | null; // versión del motor en uso (badge visible → un relevo de versión no es invisible, #10)
  changes: ChangeSummary[];
  projects: ProjectSummary[];
  ghUsage: GhUsage | null;
  usage?: Usage | null;
}

export interface ModelsResponse {
  byok: string[];
  copilot: string[];
  tiers?: Record<string, string>; // id de modelo → 'economy' | 'balanced' | 'premium' (presets de coste)
  names?: Record<string, string>; // id → nombre legible declarado en litellm.json ("deepseek-v4-flash" → "DeepSeek v4 flash")
  byokSource: string;
  copilotSource: string;
  copilotPending?: boolean; // true = el catálogo REAL del CLI aún no llegó; la lista son solo modelos observados
  byokCreds: boolean;
  byokUrl: string; // URL base guardada (sin key) → el panel muestra "conectado a …" y no re-pide la URL
  byokCachedAt: number | null;
  byokReason: string | null;
}

export interface PhaseEstimate { phase: string; estIn: number; estOut: number; }
export interface PlanCheck { id: string; label: string; always?: boolean; why?: string; }
export interface EstimateResponse { complexity: string; phases: PhaseEstimate[]; totalIn: number; totalOut: number; total: number; noRescanSaved: number; actions?: string[]; checks?: PlanCheck[]; testCmd?: string | null; }

export interface SearchHit { name: string; verdict: Verdict; archived: boolean; snippet: string; project?: string; projectId?: string; }
export interface SearchResponse { hits: SearchHit[]; }
export interface ArchiveEntry { name: string; archivedDir: string; date: string | null; verdict: Verdict; request: string; phases: number; project?: string; projectId?: string; }
export interface ArchiveResponse { archive: ArchiveEntry[]; }

// visor de sesión (events.jsonl del CLI de Copilot)
export interface SessionEvent {
  id: string | null; type: string; category: string; ts: string | null;
  depth: number; agentId: string | null; durationMs: number | null; label: string; detail: string;
}
export interface SessionSummary {
  total: number; byCategory: Record<string, number>; models: string[]; agents: string[];
  tools: Record<string, number>; durationMs: number;
  start: { cwd: string | null; branch: string | null; copilotVersion: string | null } | null;
  reconstructed?: boolean; // true si la traza se reconstruyó desde OTel (LiteLLM), no del events.jsonl del CLI
}
export interface SessionEvents { total: number; offset: number; limit: number; summary: SessionSummary; events: SessionEvent[]; noTrace?: boolean; }

export interface ModelsByRole { planner?: string; coder?: string; reviewer?: string; all?: string; }
export interface LaunchBody {
  request: string;
  name: string;
  complexity?: string;
  domain?: string;
  projectId?: string;
  project?: string;
  models?: ModelsByRole;
  auto?: boolean;
  preset?: string; // dial de gobierno: quick-fix | visual | feature | migration ('' = sin override)
  pipeline?: string[]; // fases SDD elegidas en los checkboxes (orden = ejecución; el motor reimpone verify terminal)
  runTests?: boolean; // toggle "test": ejecutar las pruebas REALES del proyecto tras el gate (opcional, no es una fase)
  attachments?: { name: string; data: string }[]; // imágenes pegadas/arrastradas (dataURL base64) → attachments/ del change
}
export interface ContinueBody { selected?: number[]; note?: string; model?: string; }
export interface ApiResult { ok: boolean; url?: string; error?: string; restored?: number; removed?: number; needsInit?: boolean; projectId?: string; }
