// ci-formats.test.mjs — CONTRATO DE SALIDA PARA CI. Lo que rompe un pipeline no es que el comando falle,
// es que emita algo MAL FORMADO: un SARIF con JSON inválido o un JUnit con XML roto revienta el job del
// cliente y el mensaje que ve es del parser de GitHub, no nuestro.
// Origen el mapa de cobertura puso `sysops/ci.mjs` en 27,4% y `core/report.mjs` en 72%,
// así que estos formatos viajaban al CI de la gente sin que ningún test comprobara su forma.
import { human, json, rdjson, sarif, junit, format, count, isBlocking } from '../lib/core/report.mjs';
import { githubWorkflow, gitlabCi } from '../lib/sysops/ci.mjs';

// hallazgos con TODA la casuística: severidades distintas, sin fichero, sin línea, con comillas y con
// caracteres que rompen XML/JSON si no se escapan.
const F = [
  { severity: 'breaking', rule: 'contract.removed', file: 'api/openapi.yaml', line: 12, message: 'endpoint eliminado' },
  { severity: 'error', rule: 'trace.test-gap', file: 'src/a.js', message: 'requisito sin test' },
  { severity: 'warning', rule: 'artifact.missing', message: 'design.md ausente (¿fase opcional?)' },
  { severity: 'info', rule: 'nota', file: 'x<y>&z"q\'.js', line: 0, message: 'raro <tag> & "comillas" \'simples\'' },
  { severity: undefined, rule: undefined, message: undefined },
];

await test('report: count/isBlocking clasifican por severidad (breaking y error bloquean; warning e info no)', () => {
  const c = count(F);
  eq(c.breaking, 1); eq(c.error, 1); eq(c.warning, 1);
  assert(isBlocking(F), 'con breaking+error, bloquea');
  assert(!isBlocking([{ severity: 'warning' }, { severity: 'info' }]), 'solo avisos NO bloquean');
  assert(!isBlocking([]), 'sin hallazgos no bloquea');
  assert(!isBlocking(null), 'entrada nula no bloquea ni revienta');
});

await test('report: json y rdjson emiten JSON VÁLIDO con caracteres que rompen si no se escapan', () => {
  const j = JSON.parse(json(F));
  assert(j.findings.length === F.length, 'no se pierde ningún hallazgo');
  const r = JSON.parse(rdjson(F));
  eq(r.source.name, 'conductor-gate');
  assert(Array.isArray(r.diagnostics) && r.diagnostics.length === F.length, 'un diagnóstico por hallazgo');
});

// EL BUG GORDO normSev existía y solo lo usaba isBlocking. Con una severidad "sucia", el
// comando salía con exit != 0 mientras junit no la contaba como failure, sarif la degradaba a "note" y
// rdjson a "INFO" → el job de CI en verde con el gate en rojo. El fail-open no estaba cerrado, movido.
await test('report: una severidad SUCIA ("Error", " BREAKING ") bloquea en TODOS los formatos — exit code e informe no pueden discrepar', () => {
  const sucios = [{ severity: 'Error', rule: 'r1', message: 'm1' }, { severity: ' BREAKING ', rule: 'r2', message: 'm2' }];
  assert(isBlocking(sucios), 'isBlocking ya lo detectaba (era el único)');
  const c = count(sucios);
  eq(c.error, 1, 'count suma en error en vez de crear una clave espuria');
  eq(c.breaking, 1);
  const j = JSON.parse(json(sucios));
  eq(j.verdict, 'FAIL');
  eq(j.count.error + j.count.breaking, 2, 'verdict y count no pueden contradecirse');
  const x = junit(sucios);
  assert(/failures="2"/.test(x), `junit debe contar 2 failures — dijo: ${(x.match(/failures="\d+"/) || [])[0]}`);
  eq(JSON.parse(sarif(sucios)).runs[0].results.map((r) => r.level), ['error', 'error'], 'sarif: error, no note');
  eq(JSON.parse(rdjson(sucios)).diagnostics.map((d) => d.severity), ['ERROR', 'ERROR'], 'rdjson: ERROR, no INFO');
});

await test('report: un hallazgo MALFORMADO (sin severity, rule ni message) no tumba el informe entero', () => {
  const roto = [{}, { severity: null }, { message: 'suelto' }];
  assert(human(roto, 't').length > 0, 'human sobrevive');
  assert(!/undefined/.test(human(roto, 't')), 'y no imprime "undefined" al usuario');
  eq(count(roto).info, 3, 'lo desconocido cae en info (no bloqueante), coherente con isBlocking');
  assert(!isBlocking(roto), 'y por tanto no bloquea');
  for (const fn of [json, rdjson, sarif, junit]) assert(String(fn(roto)).length > 0, `${fn.name} no revienta`);
});

await test('report: sarif es JSON válido y respeta el esqueleto 2.1.0 que espera GitHub', () => {
  const s = JSON.parse(sarif(F));
  eq(s.version, '2.1.0');
  assert(String(s.$schema).includes('sarif'), 'declara su schema');
  assert(Array.isArray(s.runs) && s.runs.length === 1, 'un run');
  assert(Array.isArray(s.runs[0].results) && s.runs[0].results.length === F.length, 'un result por hallazgo');
  assert(s.runs[0].tool?.driver?.name, 'el driver se identifica');
});

await test('report: junit es XML bien formado y ESCAPA <, > y & (un mensaje con < rompía el job)', () => {
  const x = junit(F);
  assert(x.startsWith('<?xml'), 'declaración XML');
  // fuera de las entidades escapadas no puede quedar ningún < o & suelto en el texto
  const cuerpo = x.replace(/<[^>]*>/g, '');
  assert(!/[<>]/.test(cuerpo), `el texto no puede llevar < o > sin escapar: ${cuerpo.slice(0, 80)}`);
  assert(!/&(?!(amp|lt|gt|quot|apos|#\d+);)/.test(cuerpo), '& siempre escapado');
  const abre = (x.match(/<testcase\b/g) || []).length;
  assert(abre >= 1, 'al menos un testcase');
});

await test('report: human nunca revienta y format() cubre los 5 formatos + desconocido', () => {
  assert(human(F, 't').length > 0);
  assert(human([], 't').length > 0, 'sin hallazgos también imprime algo');
  for (const f of ['human', 'json', 'rdjson', 'sarif', 'junit']) assert(String(format(F, f)).length > 0, `format(${f}) produce salida`);
  assert(String(format(F, 'formato-inventado')).length > 0, 'un formato desconocido degrada, no revienta');
});

await test('ci: las plantillas de GitHub Actions y GitLab salen como YAML plausible y parametrizado', () => {
  const gh = githubWorkflow({ enginePkg: 'mi-pkg' });
  assert(gh.includes('mi-pkg'), 'respeta el paquete indicado');
  assert(/on:|jobs:/.test(gh), 'estructura de workflow');
  const gl = gitlabCi({ enginePkg: 'mi-pkg' });
  assert(gl.includes('mi-pkg'));
  assert(/script:|stages:/.test(gl), 'estructura de pipeline');
  for (const t of [gh, gl]) assert(!/undefined|\[object Object\]/.test(t), 'sin interpolaciones rotas');
});
