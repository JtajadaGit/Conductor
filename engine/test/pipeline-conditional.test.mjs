// Fases CONDICIONALES gate-verificadas (workflows flexibles, versión conductor): el pipeline declarativo
// admite entradas {phase, when} con condición DETERMINISTA (sin LLM). El gate (verify) jamás es condicionable.
import { resolvePhases, phaseCondMet } from '../lib/pipeline/orchestrate.mjs';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-pcond');
const fresh = () => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); };

await test('resolvePhases: entrada string se comporta EXACTAMENTE como antes (cero regresión)', () => {
  eq(resolvePhases('medium', ['spec', 'apply', 'verify']), ['spec', 'apply', 'verify']);
  eq(resolvePhases('medium', ['spec', 'apply']), ['spec', 'apply', 'verify'], 'verify se reimpone si falta');
});

await test('resolvePhases: fase condicional con when FALSO se OMITE; verify se mantiene', () => {
  fresh();
  writeFileSync(join(TMP, 'proposal.md'), 'x'); // existe → "missing:proposal.md" es FALSO
  const phases = resolvePhases('medium', [{ phase: 'explore', when: 'missing:proposal.md' }, 'spec', 'apply'], { changeDir: TMP });
  assert(!phases.includes('explore'), 'explore se omite porque su condición no se cumple');
  eq(phases, ['spec', 'apply', 'verify'], 'resto en orden + verify reimpuesto (gate innegociable)');
});

await test('resolvePhases: fase condicional con when VERDADERO se INCLUYE', () => {
  fresh(); // proposal NO existe → "missing:proposal.md" es VERDADERO
  const phases = resolvePhases('medium', [{ phase: 'explore', when: 'missing:proposal.md' }, 'spec', 'apply', 'verify'], { changeDir: TMP });
  assert(phases.includes('explore'), 'explore se incluye porque falta proposal.md');
});

await test('resolvePhases: verify NUNCA es condicionable (se reimpone aunque su when sea falso)', () => {
  fresh();
  const phases = resolvePhases('medium', ['apply', { phase: 'verify', when: 'missing:no-existe-jamas.md' }], { changeDir: TMP });
  // 'no-existe-jamas.md' NO existe → missing es TRUE → verify se incluye; aun si fuera false, se reimpone.
  assert(phases.includes('verify'), 'el gate determinista se mantiene siempre');
  eq(phases[phases.length - 1], 'verify', 'verify queda al final');
});

await test('resolvePhases: condición por complejidad (skip clarify salvo complex)', () => {
  fresh();
  const pipe = ['spec', { phase: 'clarify', when: 'complexity>=complex' }, 'apply', 'verify'];
  assert(!resolvePhases('medium', pipe, { changeDir: TMP }).includes('clarify'), 'medium NO incluye clarify');
  assert(resolvePhases('complex', pipe, { changeDir: TMP }).includes('clarify'), 'complex SÍ incluye clarify');
});

await test('phaseCondMet: complexity >=, ==, <=', () => {
  assert(phaseCondMet('complexity>=medium', { complexity: 'complex' }) === true);
  assert(phaseCondMet('complexity>=medium', { complexity: 'simple' }) === false);
  assert(phaseCondMet('complexity==simple', { complexity: 'simple' }) === true);
  assert(phaseCondMet('complexity<=simple', { complexity: 'medium' }) === false);
});

await test('phaseCondMet: request~substr (case-insensitive)', () => {
  assert(phaseCondMet('request~migrac', { request: 'Hacer una MIGRACIÓN de datos' }) === true);
  assert(phaseCondMet('request~login', { request: 'otra cosa' }) === false);
});

await test('phaseCondMet: exists/missing contra el dir del cambio', () => {
  fresh();
  writeFileSync(join(TMP, 'spec.md'), 'x');
  assert(phaseCondMet('exists:spec.md', { changeDir: TMP }) === true);
  assert(phaseCondMet('missing:spec.md', { changeDir: TMP }) === false);
  assert(phaseCondMet('exists:nope.md', { changeDir: TMP }) === false);
});

await test('phaseCondMet: condición desconocida/vacía → FAIL-OPEN (incluye, nunca cae una fase por typo)', () => {
  assert(phaseCondMet('raro-no-soportado:x', {}) === true);
  assert(phaseCondMet('', {}) === true);
  assert(phaseCondMet(null, {}) === true);
  assert(phaseCondMet('complexity>=inventado', { complexity: 'medium' }) === true, 'nivel inexistente → fail-open');
});

await test('resolvePhases: micro IGNORA el pipeline (sin SDD por decisión del usuario)', () => {
  eq(resolvePhases('micro', [{ phase: 'spec' }, 'verify']), ['apply']);
});
