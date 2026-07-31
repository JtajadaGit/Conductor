// conductor/lib/report.mjs
// Reporting multi-formato SIN dependencias. Modelo unificado de finding →
// human | json | rdjson (reviewdog) | sarif (GitHub code scanning 2.1.0) | junit (CI).
//
// Finding: { rule, severity:'breaking'|'error'|'warning'|'info', message, file?, pointer?, line? }
// 'breaking' y 'error' son bloqueantes (exit!=0).

export const BLOCKING = new Set(['breaking', 'error']);
// normaliza la severidad antes de decidir: un 'Error'/'BREAKING'/' error ' (mayúsculas, espacios) NO debe
// colarse como no-bloqueante (fail-open). Comparación canónica en minúsculas/trim.
const normSev = (s) => String(s == null ? '' : s).toLowerCase().trim();
export const isBlocking = (findings) => (findings || []).some((f) => BLOCKING.has(normSev(f && f.severity)));
// TODOS los reporteros deben mirar la severidad por AQUÍ. Antes solo la normalizaba isBlocking, así que un
// 'Error'/' error ' salía bloqueante en el EXIT CODE y a la vez como info/note/no-failure en junit, sarif y
// rdjson: el job de CI se veía verde mientras el comando fallaba. El fail-open no estaba cerrado, estaba
// movido de sitio. Severidad ausente o desconocida → 'info' (no bloqueante), igual que decide isBlocking.
const sevOf = (f) => { const s = normSev(f && f.severity); return s in sevRank ? s : 'info'; };

const xmlEsc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const sevRank = { breaking: 0, error: 1, warning: 2, info: 3 };

export function human(findings, title = 'conductor') {
  const lines = [`\n${title}`];
  // un hallazgo SIN severity reventaba aquí (`f.severity.toUpperCase()` de undefined) y se llevaba por
  // delante el informe entero: un solo finding malformado dejaba al usuario sin ninguna salida.
  const sorted = [...(findings || [])].sort((a, b) => sevRank[sevOf(a)] - sevRank[sevOf(b)]);
  for (const f of sorted) {
    const s = sevOf(f);
    const tag = s === 'breaking' ? 'BREAKING' : s.toUpperCase().padEnd(8);
    const loc = f.file ? ` ${f.file}${f.line ? ':' + f.line : ''}` : f.pointer ? ` ${f.pointer}` : '';
    lines.push(`  ${tag.padEnd(9)} [${f.rule || '—'}]${loc}  ${f.message || ''}`);
  }
  const c = count(findings);
  lines.push(`\n  → ${isBlocking(findings) ? 'FAIL' : 'PASS'}  (${c.breaking} breaking, ${c.error} error, ${c.warning} warn, ${c.info} info)\n`);
  return lines.join('\n');
}

export function count(findings) {
  const c = { breaking: 0, error: 0, warning: 0, info: 0 };
  // con la severidad cruda, un 'Error' creaba la clave espuria c['Error'] y NO sumaba a c.error: el json
  // salía con verdict FAIL y count {error:0}, que es justo lo que lee un consumidor de CI para decidir.
  for (const f of findings || []) c[sevOf(f)]++;
  return c;
}

export function json(findings) {
  return JSON.stringify({ verdict: isBlocking(findings) ? 'FAIL' : 'PASS', count: count(findings), findings }, null, 2);
}

// reviewdog rdjson — https://github.com/reviewdog/reviewdog (DiagnosticResult)
export function rdjson(findings, toolName = 'conductor-gate') {
  const sevMap = { breaking: 'ERROR', error: 'ERROR', warning: 'WARNING', info: 'INFO' };
  return JSON.stringify({
    source: { name: toolName, url: 'https://conductor.local' },
    diagnostics: findings.map((f) => ({
      message: `[${f.rule}] ${f.message}`,
      severity: sevMap[sevOf(f)] || 'INFO',
      location: { path: f.file || 'openspec', range: { start: { line: f.line || 1, column: f.col || 1 } } },
      code: { value: f.rule },
    })),
  });
}

// SARIF 2.1.0 — GitHub code scanning / Azure DevOps
export function sarif(findings, toolName = 'conductor') {
  const sevMap = { breaking: 'error', error: 'error', warning: 'warning', info: 'note' };
  const rules = [...new Set(findings.map((f) => f.rule))].map((id) => ({ id, name: id, shortDescription: { text: id } }));
  return JSON.stringify({
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: toolName, informationUri: 'https://conductor.local', rules } },
      results: findings.map((f) => ({
        ruleId: f.rule,
        level: sevMap[sevOf(f)] || 'note',
        message: { text: f.message },
        locations: [{ physicalLocation: {
          artifactLocation: { uri: f.file || 'openspec' },
          region: { startLine: f.line || 1, startColumn: f.col || 1 },
          ...(f.pointer ? { properties: { pointer: f.pointer } } : {}),
        } }],
      })),
    }],
  }, null, 2);
}

// JUnit XML — cualquier CI que lea test reports
export function junit(findings, suite = 'conductor.gate') {
  // el más peligroso de los tres: con la severidad cruda, un 'Error' NO entraba en failures y el job de CI
  // salía VERDE mientras `conductor gate` devolvía exit != 0 por ese mismo hallazgo.
  const failures = (findings || []).filter((f) => BLOCKING.has(sevOf(f)));
  const cases = (findings || []).map((f) => {
    const name = xmlEsc(`${f.rule || '—'}: ${f.message || ''}`);
    if (BLOCKING.has(sevOf(f)))
      return `    <testcase classname="${xmlEsc(suite)}" name="${name}"><failure message="${xmlEsc(f.message)}" type="${xmlEsc(f.rule)}">${xmlEsc(f.pointer || f.file || '')}</failure></testcase>`;
    return `    <testcase classname="${xmlEsc(suite)}" name="${name}"/>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="${xmlEsc(suite)}" tests="${findings.length}" failures="${failures.length}" errors="0">
${cases.join('\n')}
  </testsuite>
</testsuites>`;
}

export function format(findings, fmt, opts = {}) {
  switch (fmt) {
    case 'json': return json(findings);
    case 'rdjson': return rdjson(findings, opts.tool);
    case 'sarif': return sarif(findings, opts.tool);
    case 'junit': return junit(findings, opts.suite);
    default: return human(findings, opts.title);
  }
}
