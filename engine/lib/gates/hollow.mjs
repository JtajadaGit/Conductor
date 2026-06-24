// conductor/lib/gates/hollow.mjs — detector DETERMINISTA (sin LLM, coste 0) de tests "huecos": los que pasan
// pero NO verifican nada. Un test hueco da FALSA señal de cobertura (el gate de traza ve "hay un test" pero el
// test no afirma nada). Escanea los ficheros de TEST escritos por el coder y marca: (1) ninguna aserción en todo
// el fichero, (2) aserción tautológica (expect(true).toBe(true), assert(true), assertEquals(x,x)), (3) cuerpo de
// test vacío, (4) todos los tests skipeados. Multi-lenguaje (JS/TS/Java/Go/Py) a propósito amplio para no marcar
// como hueco un test que sí afirma con un framework poco común (preferimos no bloquear ante la duda).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// mismo criterio de "fichero de test" que trace.mjs (separador antes de test/spec; sufijo camelCase XTest)
const isTestFile = (p) => {
  const stem = (String(p).replace(/\\/g, '/').split('/').pop() || '').replace(/\.[^.]+$/, '');
  return /(^|[._-])(test|spec)([._-]|$)/i.test(stem) || /[A-Za-z0-9]Test$/.test(stem);
};

// aserción "real" (amplio: expect/assert*/should/chai/jest matchers/JUnit/XCTest/Go testify…)
// NB: 'require' NO cuenta como aserción (es fontanería de import, no un matcher); 'should' solo en forma método
// (.should), no la palabra suelta (un título "it should work" no es una aserción).
const ASSERT_RE = /\b(expect|assert|assert_[a-z]+|assertthat|assertequals?|asserttrue|assertfalse|verify|xctassert|expect_|assert_)\b|\.(tobe|toequal|tomatch|tothrow|tocontain|tohavebeen|resolves|rejects|should)\b/i;
const HAS_TEST_DECL = /\b(test|it|describe|def\s+test_|func\s+Test[A-Z]|@test)\b/i;

// declaración de test con CUERPO VACÍO: test('x', () => {}) · it("x", function(){}) · it('x', async () => { })
const EMPTY_BODY = /\b(test|it)\s*\(\s*[`'"][^`'"]*[`'"]\s*,\s*(?:async\s*)?(?:\([^)]*\)|function\s*\*?\s*\([^)]*\))\s*(?:=>\s*)?\{\s*\}\s*\)/;

// tautologías que SIEMPRE pasan (no verifican nada real)
const TAUTOLOGIES = [
  /expect\(\s*(true|false|\d+)\s*\)\s*\.\s*to(?:be|equal)\(\s*\1\s*\)/i,   // expect(true).toBe(true) / expect(1).toEqual(1)
  /expect\(\s*([`'"][^`'"]*[`'"])\s*\)\s*\.\s*to(?:be|equal)\(\s*\1\s*\)/i, // expect('a').toBe('a')
  /\bassert(?:\.ok|true)?\(\s*(?:true|1)\s*\)/i,                            // assert(true) / assert.ok(true) / assertTrue(true)
  /\bassert_?equals?\(\s*([`'"][^`'"]*[`'"]|\d+)\s*,\s*\1\s*\)/i,           // assertEquals(x, x)
];

export function scanHollowTests(root, files = []) {
  const F = [];
  for (const rel of (files || [])) {
    if (!rel || !isTestFile(rel)) continue;
    let txt; try { txt = readFileSync(join(root, String(rel)), 'utf8'); } catch { continue; }
    // fuera comentarios (// /* */ #) para no confundir un assert comentado con uno real
    const code = txt.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(?<!:)\/\/[^\n]*/g, ' ').replace(/^\s*#[^\n]*/gm, ' ');
    if (!HAS_TEST_DECL.test(code)) continue; // no parece un fichero con tests → no opinamos

    if (!ASSERT_RE.test(code))
      F.push({ rule: 'hollow.no-assertions', severity: 'error', message: 'test sin ninguna aserción (pasa pero no verifica nada)', file: rel });

    if (TAUTOLOGIES.some((re) => re.test(code)))
      F.push({ rule: 'hollow.tautological-assertion', severity: 'error', message: 'aserción tautológica (siempre pasa, p.ej. expect(true).toBe(true) o assertEquals(x,x))', file: rel });

    if (EMPTY_BODY.test(code))
      F.push({ rule: 'hollow.empty-test', severity: 'error', message: 'test con cuerpo vacío (no ejecuta nada)', file: rel });

    const decls = (code.match(/\b(?:test|it)(?:\.skip)?\s*\(/gi) || []).length;
    const skipped = (code.match(/\b(?:xit|xtest|(?:test|it)\.skip)\s*\(/gi) || []).length;
    if (decls > 0 && skipped >= decls)
      F.push({ rule: 'hollow.all-skipped', severity: 'warning', message: 'todos los tests del fichero están skipeados', file: rel });
  }
  return F;
}
