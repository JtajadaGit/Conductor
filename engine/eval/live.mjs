// eval/live.mjs — HARNESS DE PASS-RATE EN VIVO (harness-live-passrate FASE 2).
// Mide la CREDIBILIDAD del producto con números reproducibles: por escenario y "modelo", corre el pipeline
// REAL drive() K veces y reporta pass-rate = GREEN/K. El gate sigue siendo DETERMINISTA (el eval mide al
// modelo; NUNCA un LLM decide GREEN). El mismo aparato sirve para:
//   - OFFLINE (default): un agente FAKE determinista que produce artefactos VÁLIDOS por fase → prueba que el
//     aparato funciona de punta a punta sin gastar AI Credits, y DISCRIMINA calidad (perfil 'weak' omite el
//     tag de trazabilidad → el gate estricto lo tumba → pass-rate < 100%).
//   - REAL (Jorge, bajo flag): se inyecta un runAgent que spawnea el modelo real → números de modelo reales.
// 0-dep, sin nombrar terceros, corpus local.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { drive } from '../lib/pipeline/drive.mjs';

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

// Agente FAKE por PERFIL: 'strong' produce artefactos completos y trazados (→ GREEN); 'weak' omite el tag
// @conductor en el código (→ hueco de trazabilidad: con preset estricto NO llega a GREEN). Determinista.
export function makeLiveAgent(profile, slug) {
  const traced = profile !== 'weak';
  return ({ phase, writeTo, cwd }) => {
    if (phase === 'apply' || phase === 'fix') {
      mkdirSync(join(cwd, 'src'), { recursive: true });
      const tag = traced ? `// @conductor REQ-${slug}${NL}` : '';
      writeFileSync(join(cwd, 'src', `${slug}.js`), `${tag}export const ${slug} = (n) => n + 1;${NL}`);
      writeFileSync(join(cwd, 'src', `${slug}.test.js`), `${tag}import { ${slug} } from './${slug}.js';${NL}if (${slug}(1) !== 2) throw new Error('fail');${NL}`);
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
      writeFileSync(writeTo, c);
    }
    return Promise.resolve({ code: 0 });
  };
}

// Corre UN drive() real en un dir temporal aislado y devuelve el veredicto. runAgent inyectable: si se pasa,
// se usa (modelo real); si no, el FAKE del perfil. CONDUCTOR_CAPTURE=fs aísla del git del repo.
export async function driveOnce({ tmpRoot, slug, request, complexity = 'simple', cfg = {}, profile = 'strong', runAgent = null }) {
  const prevCapture = process.env.CONDUCTOR_CAPTURE;
  process.env.CONDUCTOR_CAPTURE = 'fs';
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
    mkdirSync(join(tmpRoot, 'openspec'), { recursive: true });
    writeFileSync(join(tmpRoot, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false, serve: false, ...cfg }));
    const changeDir = join(tmpRoot, 'openspec', 'changes', slug);
    const agent = runAgent || makeLiveAgent(profile, slug);
    const r = await drive({ changeDir, request: request || `add ${slug}`, complexity, domain: 'core', srcDir: tmpRoot, runAgent: agent });
    return { verdict: r.verdict, isGreen: r.verdict === 'GREEN', gate: r.gate || null };
  } finally {
    if (prevCapture === undefined) delete process.env.CONDUCTOR_CAPTURE; else process.env.CONDUCTOR_CAPTURE = prevCapture;
  }
}

// Escenarios canónicos del harness en vivo (cubren trivial/simple/feature/migration por complejidad+preset).
// Cada uno se conduce K veces; pass-rate = GREEN/K. Con modelos reales (runAgent real) los números son del modelo.
export const LIVE_SCENARIOS = [
  { id: 'trivial-fix', slug: 'twice', request: 'add a function twice(n) returning n*2 with a test', complexity: 'micro', cfg: {} },
  { id: 'simple-feature', slug: 'inc', request: 'add a function inc(n) returning n+1 with a unit test', complexity: 'simple', cfg: {} },
  { id: 'strict-feature', slug: 'incr', request: 'add a function incr(n) with a unit test', complexity: 'simple', cfg: { preset: 'feature' } },
];

// Corre el harness completo: por escenario × modelo, K corridas. models = [{label, runAgent?}] (sin runAgent → fake).
// profileFor(label) permite mapear un label a un perfil fake (para demo/test offline de discriminación).
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
