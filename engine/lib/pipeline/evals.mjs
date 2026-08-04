// conductor/lib/pipeline/evals.mjs — GOLDEN-SET DE EVALS del harness (Verification & CI del propio producto).
// Nace de eval/live.mjs (que queda como re-export) y lo amplía: escenarios con EXPECTATIVA explícita,
// perfiles de agente fake que ejercitan CADA gate, pass-rate committeable y fingerprint de prompts.
//
// HONESTIDAD (documentada a propósito): el agente fake NO lee los prompts — este golden-set protege los
// INVARIANTES del harness (secuencia, gates, retry, nota humana, presets) ante cualquier cambio del motor
// o de la fontanería de prompts; el gate de prompts (evals-gate.test) obliga a re-certificar en verde
// antes de mergear un cambio de prompts/*.md. Con modelos reales (runAgent inyectado) mide AL MODELO.
// 0-dep, offline, 0 tokens. El gate sigue siendo determinista: JAMÁS un LLM decide GREEN.
import { mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { drive } from './drive.mjs';

const NL = '\n';
const specFor = (slug) => [
  '## ADDED Requirements',
  `<!-- id: REQ-${slug} -->`,
  `### Requirement: ${slug}`,
  `The system SHALL ${slug}.`,
  '#### Scenario: works',
  '- **GIVEN** an input',
  '- **WHEN** it runs',
  '- **THEN** it returns the output',
].join(NL);

// ── Agente FAKE por PERFIL ─────────────────────────────────────────────────────────────────────
// Cada perfil ejercita UNA dimensión del harness. Deterministas, 0 red. El agente devuelto expone
// `.captured` (array {phase, prompt}) para asertar QUÉ recibió el modelo (p.ej. la nota humana).
//   strong      — artefactos completos y trazados → GREEN
//   weak        — sin tag @conductor → hueco de trazabilidad (preset estricto lo tumba)
//   no-test     — código SIN su test → trace.test-gap (los presets estrictos lo bloquean; default = aviso)
//   secret      — el código incluye una key hardcodeada → secretScan tumba el GREEN
//   hollow      — test sin aserciones → hollow-tests gate (con cfg.hollowTests) lo tumba
//   sql         — además escribe una migración SQL segura (para dataGate del preset migration)
//   sql-danger  — migración destructiva (DROP TABLE) → DATA-FAIL
//   flaky       — el PRIMER intento de apply falla con timeout; después se comporta como strong
//               (prueba retry: con maxRetries>=1 acaba GREEN con attempts=2)
export function makeLiveAgent(profile, slug) {
  const traced = profile !== 'weak';
  let flakyFired = false;
  const agent = ({ phase, writeTo, cwd, prompt }) => {
    agent.captured.push({ phase, prompt: String(prompt || '') });
    if (profile === 'flaky' && phase === 'apply' && !flakyFired) {
      flakyFired = true;
      return Promise.resolve({ code: -1, err: 'timeout: fake transient failure' });
    }
    if (phase === 'apply' || phase === 'fix') {
      mkdirSync(join(cwd, 'src'), { recursive: true });
      const tag = traced ? `// @conductor REQ-${slug}${NL}` : '';
      const secret = profile === 'secret' ? `const apiKey = 'sk-FAKE1234567890ABCDEFffff';${NL}` : '';
      writeFileSync(join(cwd, 'src', `${slug}.js`), `${tag}${secret}export const ${slug} = (n) => n + 1;${NL}`);
      if (profile !== 'no-test') {
        const body = profile === 'hollow'
          // DECLARA un test (el gate exige señal de test para opinar — fail-open documentado) pero sin aserción
          ? `import { ${slug} } from './${slug}.js';${NL}test('works', () => { ${slug}(1); });${NL}`
          : `import { ${slug} } from './${slug}.js';${NL}if (${slug}(1) !== 2) throw new Error('fail');${NL}`;
        writeFileSync(join(cwd, 'src', `${slug}.test.js`), `${tag}${body}`);
      }
      if (profile === 'sql' || profile === 'sql-danger') {
        mkdirSync(join(cwd, 'migrations'), { recursive: true });
        const sql = profile === 'sql'
          ? `CREATE TABLE ${slug}_log (id INTEGER PRIMARY KEY, note TEXT);${NL}`
          : `DROP TABLE users;${NL}`;
        writeFileSync(join(cwd, 'migrations', '001_change.sql'), sql);
      }
      return Promise.resolve({ code: 0 });
    }
    if (writeTo) {
      mkdirSync(dirname(writeTo), { recursive: true });
      const base = String(writeTo).replace(/\\/g, '/').split('/').pop();
      let c = 'artifact content';
      if (/spec\.md$/.test(base)) c = specFor(slug);
      else if (base === 'tasks.md') c = `- [ ] 1.1 [REQ-${slug}] implement${NL}- [ ] 1.2 [REQ-${slug}] test`;
      else if (/verify-report\.md$/.test(base)) c = traced
        ? `## Verdict${NL}PASS${NL}## Per scenario${NL}✅ works — src/${slug}.js:1${NL}## Findings${NL}none${NL}## Tests${NL}src/${slug}.test.js exercises REQ-${slug}`
        : `## Verdict${NL}RISK${NL}## Per scenario${NL}⚠️ works — sin trazar${NL}## Findings${NL}falta @conductor${NL}## Tests${NL}sin tag`;
      else if (base === 'proposal.md') c = `## Why${NL}need ${slug}${NL}## What Changes${NL}- add ${slug}${NL}## Impact${NL}minimal`;
      else if (base === 'design.md') c = `## Context${NL}x${NL}## Goals / Non-Goals${NL}do ${slug}${NL}## Decisions${NL}plain${NL}## Risks / Trade-offs${NL}none`;
      else if (base === 'questions.md') c = `## Questions${NL}- [x] scope: confirmed minimal`;
      else if (base === 'exploration.md') c = `## Findings${NL}greenfield — no prior ${slug}`;
      writeFileSync(writeTo, c);
    }
    return Promise.resolve({ code: 0 });
  };
  agent.captured = [];
  return agent;
}

// Corre UN drive() real en un dir temporal aislado. runAgent inyectable (modelo real) o fake por perfil.
// CONDUCTOR_CAPTURE=fs aísla del git del repo. Devuelve también el timeline (attempts, fases) y el agente
// (con .captured) para que los escenarios puedan asertar QUÉ viajó al modelo.
export async function driveOnce({ tmpRoot, slug, request, complexity = 'simple', cfg = {}, profile = 'strong', runAgent = null, onPause = null }) {
  const prevCapture = process.env.CONDUCTOR_CAPTURE;
  process.env.CONDUCTOR_CAPTURE = 'fs';
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
    mkdirSync(join(tmpRoot, 'openspec'), { recursive: true });
    writeFileSync(join(tmpRoot, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false, serve: false, ...cfg }));
    const changeDir = join(tmpRoot, 'openspec', 'changes', slug);
    const agent = runAgent || makeLiveAgent(profile, slug);
    const r = await drive({ changeDir, request: request || `add ${slug}`, complexity, domain: 'core', srcDir: tmpRoot, runAgent: agent, ...(onPause ? { onPause } : {}) });
    return { verdict: r.verdict, isGreen: r.verdict === 'GREEN', gate: r.gate || null, timeline: r.timeline || [], agent };
  } finally {
    if (prevCapture === undefined) delete process.env.CONDUCTOR_CAPTURE; else process.env.CONDUCTOR_CAPTURE = prevCapture;
  }
}

// Escenarios canónicos del harness en vivo (compat: los 3 originales, sin expectativa = GREEN).
export const LIVE_SCENARIOS = [
  { id: 'trivial-fix', slug: 'twice', request: 'add a function twice(n) returning n*2 with a test', complexity: 'micro', cfg: {} },
  { id: 'simple-feature', slug: 'inc', request: 'add a function inc(n) returning n+1 with a unit test', complexity: 'simple', cfg: {} },
  { id: 'strict-feature', slug: 'incr', request: 'add a function incr(n) with a unit test', complexity: 'simple', cfg: { preset: 'feature' } },
];

// ── GOLDEN-SET (12): cada gate y cada invariante con su EXPECTATIVA explícita ──────────────────
// expect: 'GREEN' | 'NOT-GREEN' (verdict exacto puede variar — BLOCKED/ABORTED — sin cambiar el contrato).
// check(r): aserción extra sobre timeline/prompts; devuelve true o un string con el motivo del fallo.
export const GOLDEN_SCENARIOS = [
  { id: 'trivial-fix', slug: 'twice', request: 'add a function twice(n) with a test', complexity: 'micro', cfg: {}, profile: 'strong', expect: 'GREEN' },
  { id: 'quickfix-preset', slug: 'qfix', request: 'fix a typo', complexity: 'micro', cfg: { preset: 'quick-fix', autoApprove: true }, profile: 'strong', expect: 'GREEN' },
  { id: 'visual-preset', slug: 'vis', request: 'tweak footer contrast', complexity: 'micro', cfg: { preset: 'visual', autoApprove: true }, profile: 'strong', expect: 'GREEN' },
  { id: 'feature-strict', slug: 'incr', request: 'add incr(n) with a unit test', complexity: 'simple', cfg: { preset: 'feature', autoApprove: true }, profile: 'strong', expect: 'GREEN' },
  { id: 'feature-weak-trace', slug: 'wtr', request: 'add wtr(n) with a unit test', complexity: 'simple', cfg: { preset: 'feature', autoApprove: true }, profile: 'weak', expect: 'NOT-GREEN' },
  { id: 'strict-tests-gap', slug: 'ntg', request: 'add ntg(n) with a unit test', complexity: 'simple', cfg: { autoApprove: true }, profile: 'no-test', expect: 'NOT-GREEN' },
  { id: 'secret-scan', slug: 'sec', request: 'add sec(n) with a test', complexity: 'simple', cfg: { autoApprove: true }, profile: 'secret', expect: 'NOT-GREEN' },
  { id: 'hollow-tests', slug: 'hol', request: 'add hol(n) with a test', complexity: 'simple', cfg: { hollowTests: true, autoApprove: true }, profile: 'hollow', expect: 'NOT-GREEN' },
  { id: 'migration-green', slug: 'mig', request: 'migrate the log storage safely', complexity: 'medium', cfg: { preset: 'migration', autoApprove: true }, profile: 'sql', expect: 'GREEN' },
  { id: 'migration-danger-sql', slug: 'mgd', request: 'migrate dropping the old table', complexity: 'medium', cfg: { preset: 'migration', autoApprove: true }, profile: 'sql-danger', expect: 'NOT-GREEN' },
  {
    id: 'retry-recovery', slug: 'rty', request: 'add rty(n) with a test', complexity: 'simple', cfg: { maxRetries: 1, autoApprove: true }, profile: 'flaky', expect: 'GREEN',
    check: (r) => { const a = (r.timeline.find((p) => p.phase === 'apply') || {}).attempts; return a === 2 ? true : `attempts=${a} (esperaba 2: el retry recuperó el timeout)`; },
  },
  {
    id: 'human-note', slug: 'nte', request: 'add nte(n) with a test', complexity: 'simple', cfg: { pauseAt: ['apply'] }, profile: 'strong', expect: 'GREEN',
    onPause: () => ({ note: 'EVAL-NOTE-TOKEN-42' }),
    check: (r) => {
      const ap = r.agent.captured.find((c) => c.phase === 'apply');
      return ap && /USER NOTE/.test(ap.prompt) && /EVAL-NOTE-TOKEN-42/.test(ap.prompt) ? true : 'la nota humana NO llegó al prompt de apply';
    },
  },
];

// Corre el golden-set K veces por escenario. ok = la EXPECTATIVA se cumple K/K y el check pasa.
// Con fakes deterministas, K>1 mide DETERMINISMO del harness (un flaky aquí es un bug nuestro).
export async function runGolden({ tmpRoot, scenarios = GOLDEN_SCENARIOS, K = 2 } = {}) {
  const rows = [];
  for (const sc of scenarios) {
    const verdicts = []; let okCount = 0; let why = '';
    for (let k = 1; k <= K; k++) {
      const r = await driveOnce({ tmpRoot: join(tmpRoot, `${sc.id}-${k}`), slug: sc.slug, request: sc.request, complexity: sc.complexity, cfg: sc.cfg, profile: sc.profile, onPause: sc.onPause || null });
      verdicts.push(r.verdict);
      const matches = sc.expect === 'GREEN' ? r.verdict === 'GREEN' : r.verdict !== 'GREEN';
      const chk = sc.check ? sc.check(r) : true;
      if (matches && chk === true) okCount++;
      else if (!why) why = matches ? String(chk) : `verdict ${r.verdict} (esperaba ${sc.expect})`;
    }
    rows.push({ id: sc.id, expect: sc.expect, K, ok: okCount === K, okCount, verdicts, ...(okCount === K ? {} : { why }) });
  }
  return rows;
}

// Corre el harness por escenario × modelo (compat con la API original). models = [{label, runAgent?}].
export async function runLive({ tmpRoot, scenarios = LIVE_SCENARIOS, models = [{ label: 'fake-strong' }], K = 3, profileFor = () => 'strong' } = {}) {
  const rows = [];
  for (const model of models) {
    for (const sc of scenarios) {
      let green = 0; const verdicts = [];
      for (let k = 1; k <= K; k++) {
        const r = await driveOnce({ tmpRoot: join(tmpRoot, `${model.label}-${sc.id}-${k}`), slug: sc.slug, request: sc.request, complexity: sc.complexity, cfg: sc.cfg, profile: profileFor(model.label), runAgent: model.runAgent || null });
        verdicts.push(r.verdict); if (r.isGreen) green++;
      }
      rows.push({ model: model.label, scenario: sc.id, K, green, rate: green / K, verdicts });
    }
  }
  return rows;
}

// ── FINGERPRINT de prompts + HISTORIAL committeable ────────────────────────────────────────────
// sha256 estable del contenido de prompts/*.md (orden alfabético, CRLF→LF — sin normalizar, el hash
// bailaría entre Windows y Linux por autocrlf). Es el ancla del eval-gate: prompts nuevos ⇒ sha nuevo
// ⇒ el último resultado committeado ya no vale ⇒ re-certificar con `conductor evals`.
export function promptsFingerprint(promptsDir) {
  const h = createHash('sha256');
  let files = [];
  try { files = readdirSync(promptsDir).filter((f) => f.endsWith('.md')).sort(); } catch { return null; }
  if (!files.length) return null;
  for (const f of files) {
    const body = readFileSync(join(promptsDir, f), 'utf8').replace(/\r\n/g, '\n');
    h.update(f); h.update('\0'); h.update(body); h.update('\0');
  }
  return h.digest('hex').slice(0, 16);
}

// Appendea una línea JSONL al historial de resultados (pass-rate TRACKEADO en git — Verification & CI).
export function appendEvalResult(file, entry) {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(entry) + '\n');
  return true;
}

// Última entrada del historial (para el eval-gate). null si no existe o está vacío/corrupto.
export function lastEvalResult(file) {
  try {
    const lines = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
    return lines.length ? JSON.parse(lines[lines.length - 1]) : null;
  } catch { return null; }
}
