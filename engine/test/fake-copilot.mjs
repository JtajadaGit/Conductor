#!/usr/bin/env node
// fake-copilot.mjs — agente FALSO para el e2e offline del stack completo (0 tokens, 0 AIC).
// Imita el contrato del copilot one-shot: lee el prompt por STDIN, escribe artefactos/código con
// "sus tools nativas" (fs) y sale. Infiere la fase del prompt real del driver:
//  - fases de planning: "Write ONLY the artifact file at this absolute path ...: <path>"
//  - apply/fix: "Implement now: write ALL source and test files ..." + "Project root: <root>"
// Soporta verificar la NOTA del humano (USER NOTE) escribiéndola en el código generado.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// PRUEBA de modelo: deja constancia del COPILOT_MODEL que ESTE proceso recibió (env real del spawn)
import { appendFileSync } from 'node:fs';
if (process.env.CONDUCTOR_PROOF_FILE) {
  try { appendFileSync(process.env.CONDUCTOR_PROOF_FILE, (process.env.COPILOT_MODEL || '(none)') + '\n'); } catch {}
}
let prompt = '';
process.stdin.setEncoding('utf8');
for await (const c of process.stdin) prompt += c;

const m = prompt.match(/absolute path \(create parent directories if needed\): (.+)\n/);
if (m) {
  // fase de planning/review → escribir el artefacto pedido
  const out = m[1].trim();
  mkdirSync(dirname(out), { recursive: true });
  const base = out.replace(/\\/g, '/').split('/').pop();
  const CONTENT = {
    'exploration.md': 'Existing context: no header capability yet.',
    'proposal.md': '## Why\nUsers need a header.\n## What Changes\n- add header component\n## Impact\nminimal',
    'questions.md': '- none',
    'design.md': '## Context\nheader\n## Goals / Non-Goals\nshow title\n## Decisions\nplain component\n## Risks / Trade-offs\nnone',
    'tasks.md': '- [ ] 1.1 [REQ-HEADER] implement header\n- [ ] 1.2 [REQ-HEADER] test header',
  };
  let content = CONTENT[base];
  if (!content && /spec\.md$/.test(base)) content = '## ADDED Requirements\n<!-- id: REQ-HEADER -->\n### Requirement: Header\nThe system SHALL show a header with the site title.\n#### Scenario: shows title\n- **GIVEN** the app loads\n- **WHEN** the page renders\n- **THEN** the header shows the title';
  if (!content && /lens-/.test(base)) content = `Findings (${base}): all scenarios covered, no issues found.`;
  if (!content && /verify-report\.md$/.test(base)) content = '# Verify Report\nAll scenarios PASS.';
  writeFileSync(out, content || 'artifact content');
  // simula "lo que el modelo dice" por STDOUT (lo que verías sin conductor) → el driver lo persiste como crudo
  process.stdout.write(`FAKE-MODEL raw: escribí el artefacto ${base}\n`);
  process.exit(0);
}

const rootM = prompt.match(/Project root: (.+)\n/);
if (rootM && /Implement now/.test(prompt)) {
  // fase de código → escribir fuente + test con la marca @conductor (y la nota del humano si llegó)
  const root = rootM[1].trim();
  const note = (prompt.match(/USER NOTE \(from the human reviewer — MUST honor\): (.+)/) || [])[1];
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'header.js'), `// @conductor REQ-HEADER${note ? `\n// honoring user note: ${note}` : ''}\nexport const header = (t) => '<h1>' + t + '</h1>';\n`);
  writeFileSync(join(root, 'src', 'header.test.js'), `// @conductor REQ-HEADER\nimport { header } from './header.js';\nif (header('x') !== '<h1>x</h1>') throw new Error('fail');\n`);
  // si ya existía un fichero previo del proyecto, editarlo (para probar kinds y rollback)
  const prev = join(root, 'src', 'app.js');
  if (existsSync(prev)) writeFileSync(prev, readFileSync(prev, 'utf8') + '\n// @conductor REQ-HEADER wired header\n');
  process.stdout.write('FAKE-MODEL raw: implementé el componente header y su test\n');
  process.exit(0);
}
process.stderr.write('fake-copilot: prompt no reconocido\n');
process.exit(1);
