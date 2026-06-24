// spec-freeze.test.mjs — R-S3: spec-freeze opt-in. Congela el hash de la spec al aprobarla y bloquea el
// GREEN si la spec muta después (la fase coder corre con --allow-all-tools y podría reescribirla).
import { drive } from '../lib/pipeline/drive.mjs';
import { hashSpecs } from '../lib/provenance/provenance.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-freeze');
process.env.CONDUCTOR_CAPTURE = 'fs';
const fresh = () => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); };
const w = (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };
const ENVK = ['CONDUCTOR_MODEL', 'COPILOT_MODEL', 'CONDUCTOR_MODEL_CODER', 'CONDUCTOR_MODEL_PLANNER', 'CONDUCTOR_MODEL_REVIEWER'];
const clearEnv = () => { const s = Object.fromEntries(ENVK.map((k) => [k, process.env[k]])); for (const k of ENVK) delete process.env[k]; return s; };
const restoreEnv = (s) => { for (const k of ENVK) { if (s[k] === undefined) delete process.env[k]; else process.env[k] = s[k]; } };

const SPEC = '## ADDED Requirements\n<!-- id: REQ-C -->\n### Requirement: C\nThe system SHALL c.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c';

// agente honesto: escribe la spec en spec, código tagueado en apply
function goodAgent({ phase, writeTo, cwd }) {
  if (phase === 'apply' || phase === 'fix') {
    w(join(cwd, 'src', 'c.js'), '// @conductor REQ-C\nexport const x=1;');
    w(join(cwd, 'src', 'c.test.js'), '// @conductor REQ-C\ntest("x",()=>{});');
    return Promise.resolve({ code: 0 });
  }
  w(writeTo, { propose: '## Why\nx\n## What Changes\n- a\n## Impact\nx', spec: SPEC }[phase] || 'x');
  return Promise.resolve({ code: 0 });
}

await test('spec-freeze: con specFreeze=true la spec se congela y un run honesto llega a GREEN', async () => {
  fresh();
  const saved = clearEnv();
  try {
    const changeDir = join(TMP, 'openspec', 'changes', 'fz');
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ specFreeze: true, maxRetries: 0, lenses: false }));
    const r = await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: goodAgent });
    eq(r.verdict, 'GREEN', 'spec intacta → GREEN');
    assert(existsSync(join(changeDir, '.conductor', 'spec-freeze.json')), 'se escribió el sidecar de freeze');
  } finally { restoreEnv(saved); }
});

await test('spec-freeze: si la fase coder MUTA la spec tras congelarla → NOT-GREEN (spec.modified-after-freeze)', async () => {
  fresh();
  const saved = clearEnv();
  try {
    const changeDir = join(TMP, 'openspec', 'changes', 'mut');
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ specFreeze: true, maxRetries: 0, lenses: false }));
    // agente tramposo: en apply reescribe la spec (además del código) → debe detectarse
    const tamperAgent = (a) => {
      if (a.phase === 'apply') {
        w(join(a.cwd, 'src', 'c.js'), '// @conductor REQ-C\nexport const x=1;');
        w(join(a.cwd, 'src', 'c.test.js'), '// @conductor REQ-C\ntest("x",()=>{});');
        writeFileSync(join(changeDir, 'specs', 'c', 'spec.md'), SPEC + '\n<!-- tampered to match wrong code -->');
        return Promise.resolve({ code: 0 });
      }
      return goodAgent(a);
    };
    const r = await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: tamperAgent });
    eq(r.verdict, 'NOT-GREEN');
    eq(r.gate, 'SPEC-MODIFIED');
    assert((r.findings || []).some((f) => f.rule === 'spec.modified-after-freeze'), 'reporta la mutación de la spec');
  } finally { restoreEnv(saved); }
});

await test('spec-freeze: SIN specFreeze (default) mutar la spec NO bloquea (flujo laxo preservado)', async () => {
  fresh();
  const saved = clearEnv();
  try {
    const changeDir = join(TMP, 'openspec', 'changes', 'lax');
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false }));
    const tamperAgent = (a) => {
      if (a.phase === 'apply') {
        w(join(a.cwd, 'src', 'c.js'), '// @conductor REQ-C\nexport const x=1;');
        w(join(a.cwd, 'src', 'c.test.js'), '// @conductor REQ-C\ntest("x",()=>{});');
        writeFileSync(join(changeDir, 'specs', 'c', 'spec.md'), SPEC + '\n<!-- edited -->');
        return Promise.resolve({ code: 0 });
      }
      return goodAgent(a);
    };
    const r = await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: tamperAgent });
    eq(r.verdict, 'GREEN', 'sin freeze, el flujo laxo no bloquea por editar la spec');
    assert(!existsSync(join(changeDir, '.conductor', 'spec-freeze.json')), 'no se congela sin opt-in');
  } finally { restoreEnv(saved); }
});

await test('spec-freeze: el sello provenance embebe spec_sha256 == hash de la spec sellada', async () => {
  fresh();
  const saved = clearEnv();
  try {
    const changeDir = join(TMP, 'openspec', 'changes', 'seal');
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ specFreeze: true, maxRetries: 0, lenses: false }));
    const r = await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: goodAgent });
    eq(r.verdict, 'GREEN');
    const prov = JSON.parse(readFileSync(join(changeDir, 'provenance.json'), 'utf8'));
    eq(prov.spec_sha256, hashSpecs(changeDir), 'el sello fija el hash de la spec (spec-freeze probatorio)');
  } finally { restoreEnv(saved); }
});

rmSync(TMP, { recursive: true, force: true });
