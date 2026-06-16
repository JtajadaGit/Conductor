// conductor/lib/report.mjs
// Reporting multi-formato SIN dependencias. Modelo unificado de finding →
// human | json | rdjson (reviewdog) | sarif (GitHub code scanning 2.1.0) | junit (CI).
//
// Finding: { rule, severity:'breaking'|'error'|'warning'|'info', message, file?, pointer?, line? }
// 'breaking' y 'error' son bloqueantes (exit!=0).

export const BLOCKING = new Set(['breaking', 'error']);
export const isBlocking = (findings) => findings.some((f) => BLOCKING.has(f.severity));

const xmlEsc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const sevRank = { breaking: 0, error: 1, warning: 2, info: 3 };

export function human(findings, title = 'conductor') {
  const lines = [`\n${title}`];
  const sorted = [...findings].sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
  for (const f of sorted) {
    const tag = f.severity === 'breaking' ? 'BREAKING' : f.severity.toUpperCase().padEnd(8);
    const loc = f.file ? ` ${f.file}${f.line ? ':' + f.line : ''}` : f.pointer ? ` ${f.pointer}` : '';
    lines.push(`  ${tag.padEnd(9)} [${f.rule}]${loc}  ${f.message}`);
  }
  const c = count(findings);
  lines.push(`\n  → ${isBlocking(findings) ? 'FAIL' : 'PASS'}  (${c.breaking} breaking, ${c.error} error, ${c.warning} warn, ${c.info} info)\n`);
  return lines.join('\n');
}

export function count(findings) {
  const c = { breaking: 0, error: 0, warning: 0, info: 0 };
  for (const f of findings) c[f.severity] = (c[f.severity] || 0) + 1;
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
      severity: sevMap[f.severity] || 'INFO',
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
        level: sevMap[f.severity] || 'note',
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
  const failures = findings.filter((f) => BLOCKING.has(f.severity));
  const cases = findings.map((f) => {
    const name = xmlEsc(`${f.rule}: ${f.message}`);
    if (BLOCKING.has(f.severity))
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
