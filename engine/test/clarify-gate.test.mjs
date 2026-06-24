// clarify-gate.test.mjs — R-S5: clarify como GATE real (opt-in strict.clarify). No avanza de clarify con
// preguntas sin responder; termina BLOCKED (resume tras responder), nunca re-lanza el agente en bucle.
import { start, next } from '../lib/pipeline/orchestrate.mjs';
import { drive } from '../lib/pipeline/drive.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-clarify');
process.env.CONDUCTOR_CAPTURE = 'fs';
const fresh = () => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); };
const wf = (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };

// avanza un change complex hasta DEJAR questions.md escrito y devolver el changeDir listo para next() en clarify
function reachClarify(questions) {
  fresh();
  const CH = join(TMP, 'openspec', 'changes', 'c');
  start({ changeDir: CH, request: 'x', complexity: 'complex', domain: 'd' });
  wf(join(CH, 'exploration.md'), 'explored');
  next({ changeDir: CH });
  wf(join(CH, 'proposal.md'), '## Why\nx\n## What Changes\n- a\n## Impact\nz');
  next({ changeDir: CH });
  wf(join(CH, 'questions.md'), questions);
  return CH;
}

await test('clarify-gate: strict.clarify + preguntas sin responder → BLOCKED (no avanza)', () => {
  const CH = reachClarify('## Questions\n- [ ] ¿qué base de datos?\n- [x] ¿auth?');
  const r = next({ changeDir: CH, strict: { clarify: true } });
  eq(r.done, true); eq(r.verdict, 'BLOCKED');
  assert(/sin responder/.test(r.reason || ''), 'el motivo señala preguntas pendientes');
});

await test('clarify-gate: strict.clarify + todas respondidas → avanza a spec', () => {
  const CH = reachClarify('## Questions\n- [x] ¿qué base de datos?\n- [x] ¿auth?');
  const r = next({ changeDir: CH, strict: { clarify: true } });
  assert(r.phase === 'spec', 'con todo respondido, avanza a spec');
});

await test('clarify-gate: SIN strict.clarify (laxo) → avanza aunque haya preguntas abiertas', () => {
  const CH = reachClarify('## Questions\n- [ ] ¿algo?');
  const r = next({ changeDir: CH }); // sin strict
  assert(r.phase === 'spec', 'modo laxo: clarify no bloquea (cero regresión)');
});

await test('clarify-gate(drive): preset migration con preguntas abiertas → run BLOCKED en clarify', async () => {
  fresh();
  const ENVK = ['CONDUCTOR_MODEL', 'COPILOT_MODEL', 'CONDUCTOR_MODEL_CODER', 'CONDUCTOR_MODEL_PLANNER', 'CONDUCTOR_MODEL_REVIEWER', 'CONDUCTOR_PRESET'];
  const saved = Object.fromEntries(ENVK.map((k) => [k, process.env[k]]));
  for (const k of ENVK) delete process.env[k];
  mkdirSync(join(TMP, 'openspec'), { recursive: true });
  writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ preset: 'migration', maxRetries: 0, lenses: false }));
  // el planner deja una pregunta abierta en clarify → debe BLOQUEAR antes de spec
  const agent = (a) => {
    const c = { explore: 'x', propose: '## Why\nx\n## What Changes\n- a\n## Impact\nz', clarify: '## Questions\n- [ ] ¿alcance?' }[a.phase] || 'x';
    mkdirSync(dirname(a.writeTo), { recursive: true }); writeFileSync(a.writeTo, c);
    return Promise.resolve({ code: 0 });
  };
  try {
    const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'm'), request: 'x', complexity: 'complex', domain: 'd', srcDir: TMP, runAgent: agent });
    eq(r.verdict, 'BLOCKED', 'migration bloquea en clarify por preguntas abiertas');
    eq(r.phase, 'clarify');
  } finally { for (const k of ENVK) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
});

rmSync(TMP, { recursive: true, force: true });
