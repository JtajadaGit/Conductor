// conductor/lib/drift.mjs — living-spec: detecta divergencia spec ↔ código a lo largo del tiempo.
// (a) requisitos sin código, (b) superficie de código SIN trazar a ningún requisito (drift oculto),
// (c) drift de contrato (OpenAPI de la spec vs el actual). Devuelve findings unificados.
import { readFileSync, readdirSync, statSync, lstatSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildTrace } from './trace.mjs';
import { checkContract } from './contract.mjs';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.next', 'coverage', 'vendor']);
const CODE = /\.(ts|js|tsx|jsx|java|php|py|cls|go|cs|rb)$/;
const isTest = (p) => /(\.|_)(test|spec)\.|Test\./i.test(p);

const MAX_FILES = 20000; // cota anti-DoS
function walk(dir, acc = []) {
  if (acc.length >= MAX_FILES) return acc;
  let e; try { e = readdirSync(dir); } catch { return acc; }
  for (const n of e) { if (SKIP.has(n) || acc.length >= MAX_FILES) continue; const f = join(dir, n); let s; try { s = lstatSync(f); } catch { continue; } if (s.isSymbolicLink()) continue; s.isDirectory() ? walk(f, acc) : (CODE.test(n) && s.size < 512 * 1024 && acc.push(f)); }
  return acc;
}

export function detectDrift(changeDir, srcDir, opts = {}) {
  const F = [];
  const trace = buildTrace(changeDir, srcDir);

  // (a) requisitos sin código implementado
  for (const m of trace.matrix) if (!m.cov.code)
    F.push({ rule: 'drift.requirement-unimplemented', severity: 'error', message: `requisito ${m.id} ("${m.name}") sin código trazado`, file: 'spec.md' });

  // (b) superficie de código sin trazar (drift oculto): % de ficheros no-test sin @conductor
  const files = existsSync(srcDir) ? walk(srcDir).filter((f) => !isTest(f)) : [];
  let untracked = 0; const sample = [];
  for (const f of files) {
    let txt; try { txt = readFileSync(f, 'utf8'); } catch { continue; }
    if (!/@conductor\s+REQ-/i.test(txt)) { untracked++; if (sample.length < 5) sample.push(relative(srcDir, f).replace(/\\/g, '/')); }
  }
  const ratio = files.length ? untracked / files.length : 0;
  const threshold = opts.untrackedThreshold ?? 0.5;
  if (files.length && ratio > threshold)
    F.push({ rule: 'drift.untracked-surface', severity: 'warning', message: `${untracked}/${files.length} ficheros (${Math.round(ratio * 100)}%) sin trazar a ningún requisito (p.ej. ${sample.join(', ')})`, file: srcDir });

  // (c) drift de contrato: openapi de la spec vs el actual
  const specApi = opts.specOpenapi || join(changeDir, 'openapi.spec.json');
  const liveApi = opts.liveOpenapi || join(changeDir, 'openapi.live.json');
  if (existsSync(specApi) && existsSync(liveApi)) {
    for (const c of checkContract(specApi, liveApi)) F.push({ ...c, rule: `drift.${c.rule}` });
  }

  return { findings: F, summary: { requirements: trace.matrix.length, gaps: trace.gaps, untracked, totalFiles: files.length, untrackedRatio: +ratio.toFixed(2) } };
}
