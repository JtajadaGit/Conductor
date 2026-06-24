// live-passrate.test.mjs — harness-live-passrate FASE 2: el aparato de pass-rate corre el pipeline REAL
// drive() K veces y reporta GREEN/K, DISCRIMINANDO calidad con el gate determinista (nunca un LLM decide).
// Prueba offline (agente fake): 'strong' (trazado) → GREEN; 'weak' (sin @conductor) bajo preset estricto → NO GREEN.
import { driveOnce, runLive, makeLiveAgent } from '../eval/live.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-live-test');

await test('live-passrate: agente strong → drive() real llega a GREEN', async () => {
  const r = await driveOnce({ tmpRoot: join(TMP, 'strong'), slug: 'inc', request: 'add inc(n)=n+1 with test', complexity: 'simple', profile: 'strong' });
  eq(r.verdict, 'GREEN', 'el pipeline real cierra GREEN con artefactos válidos y trazados');
  eq(r.isGreen, true);
});

await test('live-passrate: agente weak bajo preset feature (strictTrace) → NO GREEN (gate discrimina)', async () => {
  const r = await driveOnce({ tmpRoot: join(TMP, 'weak'), slug: 'incr', request: 'add incr(n) with test', complexity: 'simple', cfg: { preset: 'feature' }, profile: 'weak' });
  assert(r.verdict !== 'GREEN', `el código sin @conductor no debe pasar el gate estricto (fue ${r.verdict})`);
  // 2 ciclos de fix no lo arreglan (el weak sigue sin trazar) → BLOCKED-NEEDS-HUMAN (R-A6 FASE 3)
  eq(r.verdict, 'BLOCKED', 'hueco de trazabilidad no resuelto → escalar a humano (BLOCKED, resumable)');
});

await test('live-passrate: runLive agrega pass-rate = GREEN/K por (modelo, escenario)', async () => {
  const rows = await runLive({
    tmpRoot: join(TMP, 'agg'),
    scenarios: [{ id: 'simple-feature', slug: 'inc2', request: 'add inc2(n) with test', complexity: 'simple', cfg: {} }],
    models: [{ label: 'fake-strong' }, { label: 'fake-weak' }],
    K: 2,
    profileFor: (label) => /weak/i.test(label) ? 'weak' : 'strong',
  });
  eq(rows.length, 2, 'una fila por (modelo × escenario)');
  const strong = rows.find((x) => x.model === 'fake-strong');
  eq(strong.green, 2, 'strong: 2/2 GREEN'); eq(strong.rate, 1);
  // sin preset estricto el weak también pasa (sin strictTrace el tag no se exige) — la discriminación se da con preset
  assert(rows.every((x) => x.K === 2 && Array.isArray(x.verdicts) && x.verdicts.length === 2), 'cada fila lleva K veredictos');
});

await test('live-passrate: makeLiveAgent devuelve un runAgent inyectable por perfil', () => {
  // El runAgent es la pieza inyectable: offline = fake por perfil; real = spawn del modelo (mismo aparato).
  // La trazabilidad real (weak omite @conductor) se valida arriba vía drive() de punta a punta.
  assert(typeof makeLiveAgent('strong', 'foo') === 'function', 'strong → función runAgent');
  assert(typeof makeLiveAgent('weak', 'foo') === 'function', 'weak → función runAgent');
});

rmSync(TMP, { recursive: true, force: true });
