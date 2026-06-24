// hollow.test.mjs — P1: detector determinista de tests "huecos" (pasan pero no verifican nada). Unit + drive.
import { scanHollowTests } from '../lib/gates/hollow.mjs';
import { drive } from '../lib/pipeline/drive.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-hollow');
process.env.CONDUCTOR_CAPTURE = 'fs';
const fresh = () => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); };
const w = (rel, c) => { const p = join(TMP, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); return rel; };
const ENVK = ['CONDUCTOR_MODEL', 'COPILOT_MODEL', 'CONDUCTOR_MODEL_CODER', 'CONDUCTOR_MODEL_PLANNER', 'CONDUCTOR_MODEL_REVIEWER', 'CONDUCTOR_PRESET'];
const clearEnv = () => { const s = Object.fromEntries(ENVK.map((k) => [k, process.env[k]])); for (const k of ENVK) delete process.env[k]; return s; };
const restoreEnv = (s) => { for (const k of ENVK) { if (s[k] === undefined) delete process.env[k]; else process.env[k] = s[k]; } };

await test('hollow(unit): detecta sin-aserciones / tautológico / cuerpo-vacío / todos-skip; un test real NO se marca', () => {
  fresh();
  const noAssert = w('a.test.js', 'test("x", () => { const y = 1 + 1; });');
  const taut = w('b.test.js', 'test("x", () => { expect(true).toBe(true); });');
  const empty = w('c.test.js', 'test("x", () => {});');
  const skip = w('d.test.js', 'it.skip("x", () => { expect(1).toBe(2); });');
  const real = w('e.test.js', 'test("suma", () => { expect(add(2,3)).toBe(5); });');
  const f = scanHollowTests(TMP, [noAssert, taut, empty, skip, real]);
  const rulesOf = (fn) => f.filter((x) => x.file === fn).map((x) => x.rule);
  assert(rulesOf('a.test.js').includes('hollow.no-assertions'), 'test sin aserciones');
  assert(rulesOf('b.test.js').includes('hollow.tautological-assertion'), 'expect(true).toBe(true)');
  assert(rulesOf('c.test.js').includes('hollow.empty-test'), 'cuerpo vacío');
  assert(rulesOf('d.test.js').includes('hollow.all-skipped'), 'todos skip');
  eq(rulesOf('e.test.js').length, 0, 'un test con aserción real no se marca');
});

await test('hollow(unit): ignora ficheros que NO son de test', () => {
  fresh();
  eq(scanHollowTests(TMP, [w('src/app.js', 'export const x = 1;')]).length, 0, 'un .js normal no se escanea');
});

await test('hollow(unit, fix QA): require() NO es aserción (falso negativo) y function(){} vacío SÍ se detecta', () => {
  fresh();
  const req = w('r.test.js', "const x = require('./mod');\ntest('hace algo', () => { x.run(); });");
  const fnEmpty = w('f.test.js', "it('vacio', function(){});");
  const f = scanHollowTests(TMP, [req, fnEmpty]);
  const rulesOf = (fn) => f.filter((x) => x.file === fn).map((x) => x.rule);
  assert(rulesOf('r.test.js').includes('hollow.no-assertions'), 'require() no cuenta como aserción → sigue hueco');
  assert(rulesOf('f.test.js').includes('hollow.empty-test'), 'cuerpo function(){} vacío detectado (antes se escapaba)');
});

const w2 = (abs, c) => { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, c); };
const mkAgent = (testBody) => (a) => {
  const { phase, writeTo, cwd } = a;
  if (phase === 'apply' || phase === 'fix') {
    w2(join(cwd, 'src', 'c.js'), '// @conductor REQ-C\nexport const x=1;');
    w2(join(cwd, 'src', 'c.test.js'), '// @conductor REQ-C\n' + testBody);
    return Promise.resolve({ code: 0 });
  }
  const content = { propose: '## Why\nx\n## What Changes\n- a\n## Impact\nx', spec: '## ADDED Requirements\n<!-- id: REQ-C -->\n### Requirement: C\nThe system SHALL c.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c' }[phase] || 'x';
  w2(writeTo, content); return Promise.resolve({ code: 0 });
};

await test('hollow(drive): cfg.hollowTests + test hueco → NOT-GREEN (HOLLOW-TESTS)', async () => {
  fresh(); const saved = clearEnv();
  try {
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ hollowTests: true, maxRetries: 0, lenses: false }));
    const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'h'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: mkAgent('test("x",()=>{});') });
    eq(r.verdict, 'NOT-GREEN'); eq(r.gate, 'HOLLOW-TESTS');
  } finally { restoreEnv(saved); }
});

await test('hollow(drive): cfg.hollowTests + test REAL (con aserción) → GREEN', async () => {
  fresh(); const saved = clearEnv();
  try {
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ hollowTests: true, maxRetries: 0, lenses: false }));
    const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'hr'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: mkAgent('test("suma",()=>{ expect(1+1).toBe(2); });') });
    eq(r.verdict, 'GREEN', 'un test con aserción real no bloquea');
  } finally { restoreEnv(saved); }
});

await test('hollow(drive): SIN cfg.hollowTests → no se evalúa (opt-in, cero regresión)', async () => {
  fresh(); const saved = clearEnv();
  try {
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false }));
    const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'hn'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: mkAgent('test("x",()=>{});') });
    eq(r.verdict, 'GREEN', 'sin el gate, un test hueco no bloquea (opt-in)');
  } finally { restoreEnv(saved); }
});

rmSync(TMP, { recursive: true, force: true });
