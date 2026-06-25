// sdd-loop.test.mjs — CIERRE DEL BUCLE SDD (apuesta token-first): el índice del historial VERIFICADO (capacidades de
// la spec viva + cambios) se realimenta a las fases de PLANIFICACIÓN (no a apply/fix/verify) → el planner construye
// SOBRE lo ya verificado y detecta conflictos, sin re-escanear las fuentes. Confidencialidad: solo del propio repo.
import { buildVerifiedIndex } from '../lib/analysis/atlas.mjs';
import { buildPrompt } from '../lib/pipeline/drive.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-sdd-loop');
const w = (rel, c) => { const p = join(TMP, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };
const REQ = (id, name) => `## ADDED Requirements\n<!-- id: ${id} -->\n### Requirement: ${name}\nThe system SHALL do it.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c\n`;

await test('bucle SDD: buildVerifiedIndex arma un índice COMPACTO de specs vivas; prioriza el dominio del cambio; vacío si no hay nada', () => {
  rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
  eq(buildVerifiedIndex(TMP, { domain: 'cart' }), '', 'sin historia verificada → índice vacío (no inventa contexto)');
  w('openspec/specs/cart/spec.md', REQ('REQ-CART-TOTAL', 'Cart total'));
  w('openspec/specs/user/spec.md', REQ('REQ-USER-LOGIN', 'User login'));
  const idx = buildVerifiedIndex(TMP, { domain: 'cart' });
  assert(idx.includes('REQ-CART-TOTAL') && idx.includes('REQ-USER-LOGIN'), 'lista las capacidades verificadas de ambos dominios');
  assert(idx.indexOf('REQ-CART-TOTAL') < idx.indexOf('REQ-USER-LOGIN'), 'el dominio del cambio (cart) va PRIMERO');
  assert(/VERIFIED HISTORY|build ON these/.test(idx), 'instruye construir SOBRE lo verificado (no duplicar, flag conflictos)');
});

await test('bucle SDD: buildPrompt INYECTA el índice en planificación (spec) pero NO en código (apply) ni en verify', () => {
  rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
  const verifiedCtx = 'PROJECT VERIFIED HISTORY (deterministic index):\n- REQ-CART-TOTAL (cart): Cart total';
  const opts = { changeDir: TMP, projectRoot: TMP, complexity: 'simple', verifiedCtx };
  const specP = buildPrompt({ phase: 'spec', role: 'planner', write_to_abs: join(TMP, 'spec.md'), instruction: 'spec' }, opts);
  assert(specP.includes('REQ-CART-TOTAL'), 'spec (planificación) RECIBE el índice verificado');
  const applyP = buildPrompt({ phase: 'apply', role: 'coder', instruction: 'apply', request: 'x' }, opts);
  assert(!applyP.includes('REQ-CART-TOTAL'), 'apply (código) NO recibe el índice — ya lee la spec/código');
  const verifyP = buildPrompt({ phase: 'verify', role: 'reviewer', write_to_abs: join(TMP, 'verify-report.md'), instruction: 'verify' }, opts);
  assert(!verifyP.includes('REQ-CART-TOTAL'), 'verify NO recibe el índice — evalúa contra la spec');
  // sin verifiedCtx (proyecto nuevo) → la planificación no añade ruido
  const specP0 = buildPrompt({ phase: 'spec', role: 'planner', write_to_abs: join(TMP, 'spec.md'), instruction: 'spec' }, { ...opts, verifiedCtx: '' });
  assert(!specP0.includes('VERIFIED HISTORY'), 'sin historial, el prompt de planificación no inyecta nada');
  rmSync(TMP, { recursive: true, force: true });
});
