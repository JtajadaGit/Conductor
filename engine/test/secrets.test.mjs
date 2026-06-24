// secrets.test.mjs — escáner de secretos/PII sobre ficheros escritos (R-G2). Unit del scanner +
// integración: un secreto en el código escrito tumba el GREEN a NOT-GREEN.
import { scanSecrets } from '../lib/gates/secrets.mjs';
import { drive } from '../lib/pipeline/drive.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-secrets');
const fresh = () => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); };
const w = (rel, c) => { const p = join(TMP, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); return rel; };

await test('secrets: detecta AWS key, JWT, private key, connection-string con credenciales', () => {
  fresh();
  const files = [
    w('a.js', 'const k = "AKIAIOSFODNN7EXAMPLE";'),
    w('b.js', 'const t = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEF1234567890";'),
    w('c.pem', '-----BEGIN RSA PRIVATE KEY-----\nMIIEoww\n-----END RSA PRIVATE KEY-----'),
    w('d.env', 'DATABASE_URL=postgres://admin:s3cr3tpwd@db.internal:5432/app'),
  ];
  const f = scanSecrets(TMP, files);
  const rules = f.map((x) => x.rule);
  assert(rules.includes('secrets.aws-access-key-id'), 'AWS key');
  assert(rules.includes('secrets.jwt'), 'JWT');
  assert(rules.includes('secrets.private-key-block'), 'private key');
  assert(rules.includes('secrets.db-connection-credentials'), 'conn-string');
  assert(f.every((x) => x.severity === 'error' && x.file && x.line >= 1), 'cada finding lleva file+line+severity');
});

await test('secrets: credencial hardcodeada en asignación; placeholder NO se marca', () => {
  fresh();
  const bad = w('x.js', 'const password = "Sup3rS3cret!2024";');
  const ok = w('y.js', 'const password = "your_password_here"; const k = process.env.API_KEY;');
  const fb = scanSecrets(TMP, [bad]);
  const fo = scanSecrets(TMP, [ok]);
  assert(fb.some((x) => x.rule === 'secrets.hardcoded-credential'), 'detecta el secreto real');
  eq(fo.length, 0, 'placeholders y process.env no se marcan');
});

await test('secrets: PII por Luhn (tarjeta válida) sí; número arbitrario no', () => {
  fresh();
  const card = w('p.js', 'const cc = "4111111111111111";'); // Visa de test, Luhn-válida
  const notcard = w('q.js', 'const id = "1234567812345670";'); // pasa Luhn pero IIN no plausible
  assert(scanSecrets(TMP, [card]).some((x) => x.rule === 'secrets.pii-card-number'), 'tarjeta válida marcada');
  eq(scanSecrets(TMP, [notcard]).filter((x) => x.rule === 'secrets.pii-card-number').length, 0, 'no-tarjeta no marcada');
});

await test('secrets: código limpio → 0 findings; binario/inexistente se ignora', () => {
  fresh();
  const clean = w('z.js', '// @conductor REQ-C\nexport const add = (a, b) => a + b;');
  const bin = w('bin.dat', 'abc\0def AKIAIOSFODNN7EXAMPLE');
  eq(scanSecrets(TMP, [clean]).length, 0, 'código limpio sin findings');
  eq(scanSecrets(TMP, [bin]).length, 0, 'binario (con \\0) se salta');
  eq(scanSecrets(TMP, ['no-existe.js']).length, 0, 'fichero inexistente se ignora');
});

await test('drive(R-G2): un secreto en el código escrito tumba el GREEN a NOT-GREEN', async () => {
  fresh();
  process.env.CONDUCTOR_CAPTURE = 'fs';
  const ENVK = ['CONDUCTOR_MODEL', 'COPILOT_MODEL', 'CONDUCTOR_MODEL_CODER', 'CONDUCTOR_MODEL_PLANNER', 'CONDUCTOR_MODEL_REVIEWER'];
  const saved = Object.fromEntries(ENVK.map((k) => [k, process.env[k]]));
  for (const k of ENVK) delete process.env[k];
  mkdirSync(join(TMP, 'openspec'), { recursive: true });
  writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false }));
  const leakyAgent = (a) => {
    const { phase, writeTo, cwd } = a;
    if (phase === 'apply' || phase === 'fix') {
      const p = join(cwd, 'src', 'leak.js'); mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, '// @conductor REQ-C\nexport const key = "AKIAIOSFODNN7EXAMPLE";');
      writeFileSync(join(cwd, 'src', 'leak.test.js'), '// @conductor REQ-C\ntest("x",()=>{});');
      return Promise.resolve({ code: 0 });
    }
    const content = {
      propose: '## Why\nx\n## What Changes\n- a\n## Impact\nx',
      spec: '## ADDED Requirements\n<!-- id: REQ-C -->\n### Requirement: C\nThe system SHALL c.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c',
    }[phase] || 'x';
    mkdirSync(dirname(writeTo), { recursive: true }); writeFileSync(writeTo, content);
    return Promise.resolve({ code: 0 });
  };
  try {
    const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'leak'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: leakyAgent });
    eq(r.verdict, 'NOT-GREEN', 'el secreto bloquea el GREEN');
    eq(r.gate, 'SECRETS-FAIL');
    assert(Array.isArray(r.secrets) && r.secrets.some((x) => x.rule === 'secrets.aws-access-key-id'), 'reporta el secreto hallado');
  } finally { for (const k of ENVK) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
});

rmSync(TMP, { recursive: true, force: true });
