// Tests de las PAUSAS EN TERMINAL (lib/pipeline/ttypause.mjs): mismas decisiones que la web, en consola.
// La factoría recibe `ask` inyectable → se testea con respuestas guionizadas, sin TTY real.
import { parseChoice, parseSelection, createTtyPause } from '../lib/pipeline/ttypause.mjs';

// harness: onPause con respuestas en cola; si se agota el guion, responde 's' (stop) para no colgar jamás
const mk = (answers) => {
  const q = [...answers]; const logs = [];
  const onPause = createTtyPause({ ask: async () => (q.length ? q.shift() : 's'), log: (m) => logs.push(String(m)) });
  return { onPause, logs };
};

await test('ttypause: parseChoice — Enter/a=aprobar · s=stop · n/m/r · números=selección · basura=null', () => {
  eq(parseChoice(''), 'approve'); eq(parseChoice('a'), 'approve'); eq(parseChoice(' YES '), 'approve');
  eq(parseChoice('s'), 'stop'); eq(parseChoice('q'), 'stop');
  eq(parseChoice('n'), 'note'); eq(parseChoice('m'), 'model'); eq(parseChoice('R'), 'redo');
  eq(parseChoice('1,3'), 'select'); eq(parseChoice(' 2 '), 'select');
  eq(parseChoice('zzz'), null);
});

await test('ttypause: parseSelection — 1-based→0-based, dedup, fuera de rango fuera', () => {
  eq(parseSelection('1, 3', 4), [0, 2]);
  eq(parseSelection('2,2', 3), [1]);
  eq(parseSelection('0,9', 3), [], 'índices inválidos no cuelan');
});

await test('ttypause: Enter aprueba · s detiene', async () => {
  eq(await mk(['']).onPause({ before: 'apply' }), {});
  eq(await mk(['s']).onPause({ before: 'apply' }), { stop: true });
});

await test('ttypause: nota y modelo — vacíos re-preguntan (nunca se envía nada hueco)', async () => {
  eq(await mk(['n', 'usa el servicio existente']).onPause({ before: 'apply' }), { note: 'usa el servicio existente' });
  eq(await mk(['m', 'byok:qwen-x']).onPause({ before: 'apply' }), { model: 'byok:qwen-x' });
  const t = mk(['n', '', 'a']); // nota vacía → aviso → vuelve al menú → aprueba
  eq(await t.onPause({ before: 'apply' }), {});
  assert(t.logs.some((l) => l.includes('⚠')), 'avisó de la nota vacía');
});

await test('ttypause: redo pide fase + instrucción OBLIGATORIA (chat-en-pausa por consola)', async () => {
  eq(await mk(['r', 'spec', 'los contadores empiezan en 10']).onPause({ before: 'apply' }), { redo: 'spec', note: 'los contadores empiezan en 10' });
  const t = mk(['r', 'spec', '', 's']); // sin instrucción → re-pregunta → stop
  eq(await t.onPause({ before: 'apply' }), { stop: true });
  assert(t.logs.some((l) => l.includes('instrucción')), 'exigió la instrucción');
});

await test('ttypause: pausa de fix — números seleccionan hallazgos; redo rechazado; Enter corrige todos', async () => {
  const findings = [{ message: 'a', severity: 'error' }, { message: 'b', severity: 'warning' }, { message: 'c' }];
  eq(await mk(['1,3']).onPause({ before: 'fix', findings }), { selected: [0, 2] });
  eq(await mk(['']).onPause({ before: 'fix', findings }), {}, 'Enter = corregir todos (default del driver)');
  const t = mk(['r', '']); // redo no aplica en fix → aviso → Enter aprueba
  eq(await t.onPause({ before: 'fix', findings }), {});
  assert(t.logs.some((l) => l.includes('fix')), 'explicó por qué no hay redo en fix');
});

await test('ttypause: entrada no reconocida re-pregunta (un typo jamás aprueba)', async () => {
  const t = mk(['zzz', 's']);
  eq(await t.onPause({ before: 'verify' }), { stop: true });
  assert(t.logs.some((l) => l.includes('no te he entendido')), 'reaccionó al typo');
});
