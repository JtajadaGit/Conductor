// R-S6: validación SEMÁNTICA del delta en checkCoherence (preset migration). MODIFIED debe existir en la
// spec viva; REMOVED no debe quedar código trazado. Opt-in (opts.semanticDelta) → cero regresión sin él.
import { checkCoherence, parseSpec } from '../lib/gates/coherence.mjs';
import { liveSpecIds } from '../lib/pipeline/orchestrate.mjs';
import { drive } from '../lib/pipeline/drive.mjs';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-semdelta');
const w = (rel, c) => { const p = join(TMP, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };

await test('parseSpec (R-S6): asigna deltaType (ADDED/MODIFIED/REMOVED) a cada requisito', () => {
  const s = parseSpec('## ADDED Requirements\n### Requirement: New\n#### Scenario: s\n\n## MODIFIED Requirements\n<!-- id: REQ-A -->\n### Requirement: A\n#### Scenario: s');
  eq(s.requirements.find((r) => r.name === 'New').deltaType, 'ADDED');
  eq(s.requirements.find((r) => r.name === 'A').deltaType, 'MODIFIED');
});

await test('semantic-delta (R-S6): MODIFIED no en spec viva → error; REMOVED con código trazado → error; opt-in', () => {
  rmSync(TMP, { recursive: true, force: true });
  w('specs/core/spec.md', '## MODIFIED Requirements\n<!-- id: REQ-A -->\n### Requirement: A\nThe system SHALL do A better.\n#### Scenario: s\n- **GIVEN** x\n\n## REMOVED Requirements\n<!-- id: REQ-OLD -->\n### Requirement: Old\n#### Scenario: s2\n- **GIVEN** y');
  w('apply-report.md', 'Status: done\nFiles created: a.js\nTasks completed: 1/1');
  w('tasks.md', '- [x] 1.1 [REQ-A] do A');
  // REQ-A NO está en la spec viva (solo REQ-OTHER) → modified-not-in-live; REQ-OLD aún trazado → removed-code-exists
  const F = checkCoherence(TMP, { semanticDelta: true, liveSpecIds: ['REQ-OTHER'], tracedReqIds: ['REQ-OLD'] });
  assert(F.some((f) => f.rule === 'delta.modified-not-in-live'), 'MODIFIED REQ-A no en vivo → error');
  assert(F.some((f) => f.rule === 'delta.removed-code-exists'), 'REMOVED REQ-OLD aún trazado → error');
  // cero regresión: sin opts.semanticDelta NO se emite ningún finding delta.*
  const F2 = checkCoherence(TMP, {});
  assert(!F2.some((f) => f.rule.startsWith('delta.')), 'sin semanticDelta no hay findings de delta (opt-in)');
  rmSync(TMP, { recursive: true, force: true });
});

await test('liveSpecIds (R-S6 wiring): lee los REQ ids de la spec VIVA (openspec/specs/*/spec.md); fail-safe []', () => {
  rmSync(TMP, { recursive: true, force: true });
  w('openspec/specs/core/spec.md', '# Core\n<!-- id: REQ-LIVE -->\n### Requirement: Live\n<!-- id: REQ-TWO -->\n### Requirement: Two');
  eq(liveSpecIds(TMP).sort(), ['REQ-LIVE', 'REQ-TWO']);
  eq(liveSpecIds(join(TMP, 'nope')), [], 'proyecto sin specs vivas → [] (fail-safe: no dispara, no bloquea)');
  rmSync(TMP, { recursive: true, force: true });
});

await test('semantic-delta (R-S6 e2e): drive con preset migration → MODIFIED no en spec viva BLOQUEA el run', async () => {
  rmSync(TMP, { recursive: true, force: true });
  const prevCapture = process.env.CONDUCTOR_CAPTURE; process.env.CONDUCTOR_CAPTURE = 'fs';
  const ENVK = ['CONDUCTOR_MODEL', 'COPILOT_MODEL', 'CONDUCTOR_MODEL_CODER', 'CONDUCTOR_MODEL_PLANNER', 'CONDUCTOR_MODEL_REVIEWER', 'CONDUCTOR_PRESET'];
  const saved = Object.fromEntries(ENVK.map((k) => [k, process.env[k]])); for (const k of ENVK) delete process.env[k];
  try {
    // spec VIVA del proyecto: solo REQ-OTHER existe (REQ-GONE NO está → MODIFIED sobre ella es incoherente)
    w('openspec/specs/core/spec.md', '# Core\n## Purpose\nx\n<!-- id: REQ-OTHER -->\n### Requirement: Other\nThe system SHALL other.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c');
    // preset migration con pausas desactivadas (cfg.pauseAt:[] gana) para alcanzar verify sin intervención
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ preset: 'migration', pauseAt: [], maxRetries: 0, lenses: false }));
    const agent = (a) => {
      const { phase, writeTo, cwd } = a;
      if (phase === 'apply' || phase === 'fix') {
        mkdirSync(join(cwd, 'src'), { recursive: true });
        writeFileSync(join(cwd, 'src', 'g.js'), '// @conductor REQ-GONE\nexport const g = 1;\n');
        writeFileSync(join(cwd, 'src', 'g.test.js'), '// @conductor REQ-GONE\nif (1!==1) throw new Error("x");\n');
        return Promise.resolve({ code: 0 });
      }
      mkdirSync(dirname(writeTo), { recursive: true });
      const base = String(writeTo).replace(/\\/g, '/').split('/').pop();
      let c = 'x';
      if (/spec\.md$/.test(base)) c = '## MODIFIED Requirements\n<!-- id: REQ-GONE -->\n### Requirement: Gone\nThe system SHALL change the missing one.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c';
      else if (base === 'questions.md') c = '## Questions\n(ninguna)';
      else if (base === 'tasks.md') c = '- [ ] 1.1 [REQ-GONE] do it';
      else if (base === 'proposal.md') c = '## Why\nx\n## What Changes\n- a\n## Impact\nz';
      else if (base === 'design.md') c = '## Context\nx\n## Goals / Non-Goals\ng\n## Decisions\nd\n## Risks / Trade-offs\nr';
      else if (/verify-report\.md$/.test(base)) c = '## Verdict\nPASS\n## Per scenario\n✅ s — src/g.js:1\n## Findings\nnone\n## Tests\nsrc/g.test.js';
      writeFileSync(writeTo, c);
      return Promise.resolve({ code: 0 });
    };
    const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'mig'), request: 'modify the gone requirement', complexity: 'complex', domain: 'core', srcDir: TMP, runAgent: agent });
    assert(r.verdict !== 'GREEN', `MODIFIED sobre un REQ inexistente en la spec viva NO puede ser GREEN (fue ${r.verdict})`);
    assert((r.findings || []).some((f) => f.rule === 'delta.modified-not-in-live'), 'el gate de migración emite delta.modified-not-in-live (R-S6 e2e)');
  } finally {
    for (const k of ENVK) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    if (prevCapture === undefined) delete process.env.CONDUCTOR_CAPTURE; else process.env.CONDUCTOR_CAPTURE = prevCapture;
    rmSync(TMP, { recursive: true, force: true });
  }
});
