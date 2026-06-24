// conductor/lib/estimate.mjs — ESTIMADOR ESTÁTICO de tokens por fase (preflight, sin llamar a la API).
// Pilar "ahorro de tokens first": proyecta el consumo ANTES de lanzar, para decidir complejidad/modelo
// con datos. Determinista (chars/4 + contexto acumulado de artefactos). El coste en $ depende del modelo;
// aquí estimamos TOKENS (el proxy real del ahorro; con BYOK/qwen el $ es ~0). 0 dependencias.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const tokensOf = (s) => Math.ceil(String(s || '').length / 4);

// salida típica por fase (heurística determinista y conservadora, alineada con los límites de los prompts)
const OUT_EST = { explore: 180, propose: 220, clarify: 140, spec: 900, design: 320, tasks: 260, apply: 4200, fix: 1600, verify: 850 };
const PHASES = {
  micro: ['apply'],
  simple: ['propose', 'spec', 'apply', 'verify'],
  medium: ['explore', 'propose', 'spec', 'design', 'tasks', 'apply', 'verify'],
  complex: ['explore', 'propose', 'clarify', 'spec', 'design', 'tasks', 'apply', 'verify'],
};
const ARTIFACT = (phase, domain) => ({
  explore: 'exploration.md', propose: 'proposal.md', clarify: 'questions.md', spec: `specs/${domain}/spec.md`,
  design: 'design.md', tasks: 'tasks.md', apply: 'apply-report.md', fix: 'apply-report.md', verify: 'verify-report.md',
}[phase]);

// estima entrada/salida por fase. La entrada ≈ instrucción base + contexto acumulado (artefactos previos,
// reales si ya existen — útil para estimar un resume). La salida ≈ heurística por fase.
export function estimateRun({ changeDir, complexity = 'medium', domain = 'core', request = '', baseInstruction = 400 } = {}) {
  // L2/L3: complexity llega de un query param (/api/estimate?complexity=). Un "toString"/"constructor"/
  // "__proto__" hacía PHASES[complexity] = función heredada → "phases is not iterable" → 500. Solo claves PROPIAS.
  if (!Object.prototype.hasOwnProperty.call(PHASES, complexity)) complexity = 'medium';
  const phases = PHASES[complexity];
  const rows = [];
  let ctx = tokensOf(request);
  for (const phase of phases) {
    const estIn = baseInstruction + ctx;
    const estOut = OUT_EST[phase] ?? 300;
    rows.push({ phase, estIn, estOut });
    // el artefacto que produce esta fase entra como contexto de las siguientes (real si existe, si no la estimación)
    let add = estOut;
    try { const a = ARTIFACT(phase, domain); if (a && changeDir) { const p = join(changeDir, a); if (existsSync(p)) add = tokensOf(readFileSync(p, 'utf8')); } } catch { /* usa estimación */ }
    ctx += add;
  }
  const totalIn = rows.reduce((a, r) => a + r.estIn, 0);
  const totalOut = rows.reduce((a, r) => a + r.estOut, 0);
  // NO-RESCAN (palanca nº1): las fases del planner NO releen las fuentes del proyecto (instrucción en el
  // prompt). SIN no-rescan, cada una añadiría un "rescan" del repo a su entrada. Modelo CONSERVADOR y
  // declarado como ESTIMACIÓN (no medición): RESCAN_EST tokens de entrada evitados por fase derivada.
  const DERIVED = new Set(['explore', 'propose', 'clarify', 'spec', 'design', 'tasks']);
  const RESCAN_EST = 8000; // entrada típica de releer el contexto del repo, por fase (conservador)
  const noRescanSaved = phases.filter((p) => DERIVED.has(p)).length * RESCAN_EST;
  return { complexity, phases: rows, totalIn, totalOut, total: totalIn + totalOut, noRescanSaved };
}

// CONTEXTO PRESUPUESTADO (R-T2, token-first): dado un mapa nombre→contenido de artefactos del change,
// decide cuáles caben en el presupuesto (token-first) y cuáles deben resumirse. Preserva el no-rescan:
// solo artefactos del change, nunca código fuente. La spec NUNCA se omite (se comprime si excede).
// Retorna: { included, summarized, tokensUsed, exceeds }
const DEFAULT_CTX_BUDGET = 12000; // tokens razonables para contexto del change; puede sobreescribirse
const CTX_PRIORITY = ['spec.md', 'tasks.md', 'design.md', 'apply-report.md', 'verify-report.md'];
export function budgetContextFiles(artifacts = {}, budget = DEFAULT_CTX_BUDGET) {
  const result = { included: [], summarized: [], tokensUsed: 0, exceeds: false };
  for (const fname of CTX_PRIORITY) {
    const content = artifacts[fname];
    if (content === undefined || content === null) continue;
    const tokens = tokensOf(content);
    if (result.tokensUsed + tokens <= budget) {
      result.included.push(fname);
      result.tokensUsed += tokens;
    } else {
      result.summarized.push(fname);
    }
  }
  result.exceeds = result.summarized.length > 0;
  return result;
}

// Resumidor de artefacto: extrae solo encabezados H2/H3 + comentarios HTML (<!-- id: REQ-* -->) del
// contenido. Preserva la estructura del artefacto pero descarta la prosa (token-first). El agente sigue
// viendo TODOS los requisitos (por su id/nombre) sin leer el cuerpo completo.
export function summarizeArtifact(content) {
  const lines = String(content || '').split('\n');
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || /^##\s/.test(line) || /^###\s/.test(line) || /<!--.*?-->/.test(line)) out.push(line);
  }
  return out.join('\n');
}
