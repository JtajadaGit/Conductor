// cli-usage.test.mjs — CONTRATO DE ERRORES DEL CLI: a un comando al que le falta un argumento se le exige
// decir QUÉ falta, nunca escupir el error interno de Node.
// Origen barriendo los ~45 comandos apareció `conductor status` devolviendo
// «The "paths[0]" argument must be of type string. Received undefined» — era el único que no daba su línea
// de uso, porque pasaba `undefined` a runIdFor(). Misma familia que el crash `st is not defined` de
// printStats: bin/conductor.mjs tenía 30% de cobertura de funciones y nada de esto se ejecutaba en tests.
// Barre TODOS los comandos que exigen argumento, así que cubre también los que se añadan después.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'conductor.mjs');
// firmas de un fallo de PROGRAMACIÓN filtrado al usuario (no de un error de uso legítimo)
const LEAK = /argument must be of type|ReferenceError|TypeError|is not defined|is not a function|Cannot read (properties|property)|node:internal/;
// comandos que EXIGEN al menos un argumento. `archive`/`skills`/`stack`/`atlas` quedan fuera a propósito:
// operan sobre el directorio actual y sin argumentos hacen algo válido (listar), no es un error de uso.
const NEEDS_ARG = ['status', 'resume', 'gate', 'trace', 'contract', 'migrate', 'receipt', 'dashboard', 'drift', 'search', 'verify', 'eval', 'policy', 'ledger', 'seal'];

// una sola ejecución por comando, reutilizada por todos los asserts (51 spawns alargaban la suite)
const R = new Map();
for (const cmd of [...NEEDS_ARG, 'frobnicate']) {
  try { R.set(cmd, { code: 0, out: execFileSync(process.execPath, [BIN, cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 }) }); }
  catch (e) { R.set(cmd, { code: e.status ?? -1, out: String(e.stdout || '') + String(e.stderr || '') }); }
}

await test('cli: ningún comando FILTRA errores internos de Node cuando le falta un argumento', () => {
  const leaks = NEEDS_ARG.filter((c) => LEAK.test(R.get(c).out))
    .map((c) => `${c}: ${R.get(c).out.split('\n').find((l) => LEAK.test(l))?.trim().slice(0, 110)}`);
  eq(leaks, [], `filtran errores internos en vez de decir qué falta:\n   ${leaks.join('\n   ')}`);
});

await test('cli: el comando al que le falta un argumento DICE qué falta y sale con código != 0', () => {
  const mudos = NEEDS_ARG.filter((c) => { const r = R.get(c); return !(r.code !== 0 && /uso:|usage:|falta|requiere|no encontrado/i.test(r.out)); })
    .map((c) => `${c} (exit ${R.get(c).code}): ${R.get(c).out.trim().slice(0, 90) || '(sin salida)'}`);
  eq(mudos, [], `no orientan al usuario:\n   ${mudos.join('\n   ')}`);
});

await test('cli: status/resume sin argumento dan su línea de uso (regresión del error interno filtrado)', () => {
  for (const cmd of ['status', 'resume']) {
    const out = R.get(cmd).out;
    assert(/uso:/.test(out), `${cmd} debe imprimir "uso:" — dijo: ${out.trim().slice(0, 110)}`);
    assert(!LEAK.test(out), `${cmd} no debe filtrar el error interno — dijo: ${out.trim().slice(0, 110)}`);
  }
});

await test('cli: un comando inexistente no revienta, orienta', () => {
  const r = R.get('frobnicate');
  assert(r.code !== 0, 'exit != 0');
  assert(!LEAK.test(r.out), `sin errores internos — dijo: ${r.out.trim().slice(0, 110)}`);
});
