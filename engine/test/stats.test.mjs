// Tests del agregador de uso (lib/stats.mjs): mezcla qwen+Copilot, coste, ahorro, edge cases.
import { aggregateStats } from '../lib/core/stats.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-stats');
const fresh = () => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); };
// escribe un timeline.json en openspec/changes/<name>/.conductor/ (archived → bajo changes/archive/)
const writeTL = (root, name, tl, archived = false) => {
  const dir = archived
    ? join(root, 'openspec', 'changes', 'archive', name, '.conductor')
    : join(root, 'openspec', 'changes', name, '.conductor');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'timeline.json'), JSON.stringify(tl));
};

await test('stats: agrega por proveedor y modelo, cuenta runs y hace VISIBLE el ahorro', async () => {
  fresh();
  const root = join(TMP, 'proj-a');
  // run GREEN con mezcla: sonnet (copilot) + qwen (byok) + haiku (copilot)
  writeTL(root, 'feat-a', {
    verdict: 'GREEN', total_ms: 60000, phases: [
      { phase: 'spec', role: 'planner', model: 'claude-sonnet-4-6', provider: 'copilot', tokens: { in: 1000, out: 500 }, ms: 10000, ok: true },
      { phase: 'apply', role: 'coder', model: 'qwen36-msc1', provider: 'byok', tokens: { in: 2000, out: 1000 }, ms: 20000, ok: true },
      { phase: 'verify', role: 'reviewer', model: 'claude-haiku-4-5', provider: 'copilot', tokens: { in: 800, out: 200 }, ms: 5000, ok: true },
    ],
  });
  // run ABORTED archivado, solo qwen
  writeTL(root, '2026-01-01-feat-b', {
    verdict: 'ABORTED', total_ms: 30000, phases: [
      { phase: 'spec', role: 'planner', model: 'qwen36-msc1', provider: 'byok', tokens: { in: 500, out: 100 }, ms: 30000, ok: false },
    ],
  }, true);
  // change sin timeline → se ignora
  mkdirSync(join(root, 'openspec', 'changes', 'sin-run'), { recursive: true });

  const r = aggregateStats([{ id: 'proj-a~abc', root }]);
  eq(r.runs, 2, 'cuenta activos + archivados');
  eq(r.green, 1, 'un GREEN');
  eq(r.failed, 1, 'el ABORTED cuenta como fallido');
  eq(r.aborted, 1, 'un ABORTED');
  eq(r.phases, 4, '3 + 1 fases');
  eq(r.mean_ms, 45000, 'media de duración (60s + 30s)/2');
  eq(r.tokens, { in: 4300, out: 1800 }, 'tokens totales');
  // coste: sonnet (in3/out15) + haiku (in1/out5) + qwen (0) → 0.0105 + 0.0018 = 0.0123
  eq(r.cost_usd, 0.0123, 'coste real solo de las fases premium');
  // naive todo-opus (in5/out25): 0.0175 + 0.035 + 0.009 + 0.005 = 0.0665
  eq(r.naive_all_premium_usd, 0.0665, 'coste si todo fuera premium');
  eq(r.saved_pct, 81.5, 'ahorro % por la mezcla');

  const byok = r.byProvider.find((p) => p.provider === 'byok');
  const cop = r.byProvider.find((p) => p.provider === 'copilot');
  eq(byok.calls, 2, 'dos fases byok (apply + feat-b spec)');
  eq(byok.cost_usd, 0, 'byok = $0');
  eq(cop.calls, 2, 'dos fases copilot (spec + verify)');
  eq(cop.cost_usd, 0.0123, 'todo el coste es de copilot');

  const qwen = r.byModel.find((m) => m.model === 'qwen36-msc1');
  eq(qwen.calls, 2, 'qwen usado dos veces');
  eq(qwen.provider, 'byok', 'qwen clasificado como byok');
  assert(r.byModel[0].calls >= r.byModel[r.byModel.length - 1].calls, 'byModel ordenado por uso desc');
});

await test('stats: infiere el proveedor por TIER del modelo cuando la fase no lo declara', async () => {
  fresh();
  const root = join(TMP, 'proj-infer');
  writeTL(root, 'feat', {
    verdict: 'GREEN', total_ms: 1000, phases: [
      { phase: 'apply', model: 'qwen36-msc1', tokens: { in: 10, out: 10 } },        // sin provider → byok (tier)
      { phase: 'spec', model: 'claude-sonnet-4-6', tokens: { in: 10, out: 10 } },    // sin provider → copilot
    ],
  });
  const r = aggregateStats([root]); // admite también strings de ruta
  const byok = r.byProvider.find((p) => p.provider === 'byok');
  const cop = r.byProvider.find((p) => p.provider === 'copilot');
  eq(byok.calls, 1, 'qwen sin provider → byok por tier');
  eq(cop.calls, 1, 'sonnet sin provider → copilot por tier');
});

await test('stats: self-repair rate — runs con ciclo fix que recuperan a GREEN', async () => {
  fresh();
  const root = join(TMP, 'proj-sr');
  // run que falló en verify, hizo un fix y recuperó a GREEN (selfRepair.recovered=true)
  writeTL(root, 'rec', { verdict: 'GREEN', total_ms: 1000, selfRepair: { fixCycles: 1, recovered: true }, phases: [
    { phase: 'apply', model: 'qwen36-msc1', provider: 'byok', tokens: { in: 5, out: 5 } },
    { phase: 'fix', model: 'qwen36-msc1', provider: 'byok', tokens: { in: 5, out: 5 } },
    { phase: 'verify', model: 'claude-haiku-4-5', provider: 'copilot', tokens: { in: 5, out: 5 } },
  ] });
  // run que falló y NO recuperó (2 ciclos fix, sigue NOT-GREEN)
  writeTL(root, 'norec', { verdict: 'NOT-GREEN', total_ms: 1000, selfRepair: { fixCycles: 2, recovered: false }, phases: [
    { phase: 'apply', model: 'qwen36-msc1', provider: 'byok', tokens: { in: 5, out: 5 } },
    { phase: 'fix', model: 'qwen36-msc1', provider: 'byok', tokens: { in: 5, out: 5 } },
  ] });
  // run GREEN limpio sin fix → no cuenta en runs_with_fix
  writeTL(root, 'clean', { verdict: 'GREEN', total_ms: 1000, selfRepair: { fixCycles: 0, recovered: false }, phases: [
    { phase: 'apply', model: 'qwen36-msc1', provider: 'byok', tokens: { in: 5, out: 5 } },
  ] });
  const r = aggregateStats([{ root }]);
  eq(r.selfRepair.runs_with_fix, 2, 'dos runs tuvieron ciclo fix');
  eq(r.selfRepair.recovered, 1, 'uno recuperó sin humano');
  eq(r.selfRepair.rate_pct, 50, 'self-repair rate = 50%');
});

await test('stats: self-repair compat — timelines antiguos sin selfRepair (infiere por fases fix)', async () => {
  fresh();
  const root = join(TMP, 'proj-srold');
  // timeline VIEJO (sin campo selfRepair) con una fase fix y GREEN → debe contar como recuperado
  writeTL(root, 'old', { verdict: 'GREEN', total_ms: 1000, phases: [
    { phase: 'apply', model: 'qwen36-msc1', provider: 'byok', tokens: { in: 5, out: 5 } },
    { phase: 'fix', model: 'qwen36-msc1', provider: 'byok', tokens: { in: 5, out: 5 } },
    { phase: 'verify', model: 'claude-haiku-4-5', provider: 'copilot', tokens: { in: 5, out: 5 } },
  ] });
  const r = aggregateStats([{ root }]);
  eq(r.selfRepair.runs_with_fix, 1, 'infiere el ciclo fix del array de fases');
  eq(r.selfRepair.recovered, 1, 'GREEN con fase fix → recuperado');
});

await test('stats: sin proyectos / sin timelines no rompe (todo en cero)', async () => {
  fresh();
  const empty = aggregateStats([]);
  eq(empty.runs, 0, 'cero runs');
  eq(empty.saved_pct, 0, 'sin datos, ahorro 0 (no NaN/Infinity)');
  eq(empty.byProvider, [], 'sin proveedores');
  // root real pero sin ningún timeline
  const root = join(TMP, 'vacio'); mkdirSync(join(root, 'openspec', 'changes'), { recursive: true });
  const r = aggregateStats([{ root }]);
  eq(r.runs, 0, 'root sin runs → 0');
  eq(r.perProject, [], 'no añade proyectos sin runs');
});

await test('stats: perProject separa byok vs copilot y ordena por nº de runs', async () => {
  fresh();
  const a = join(TMP, 'multi-a'), b = join(TMP, 'multi-b');
  writeTL(a, 'x', { verdict: 'GREEN', total_ms: 1000, phases: [{ phase: 'apply', model: 'qwen36-msc1', provider: 'byok', tokens: { in: 5, out: 5 } }] });
  writeTL(b, 'y1', { verdict: 'GREEN', total_ms: 1000, phases: [{ phase: 'apply', model: 'claude-sonnet-4-6', provider: 'copilot', tokens: { in: 5, out: 5 } }] });
  writeTL(b, 'y2', { verdict: 'RED', total_ms: 1000, phases: [{ phase: 'verify', model: 'claude-sonnet-4-6', provider: 'copilot', tokens: { in: 5, out: 5 } }] });
  const r = aggregateStats([{ root: a }, { root: b }]);
  eq(r.perProject.length, 2, 'dos proyectos con runs');
  eq(r.perProject[0].root, b, 'el de más runs (b=2) va primero');
  eq(r.perProject[0].copilot_phases, 2, 'b: dos fases copilot');
  eq(r.perProject[1].byok_phases, 1, 'a: una fase byok');
  eq(r.running, 0, 'ningún run en curso');
});

await test('stats: byModelPhase cruza modelo x fase con conteo y green rate', async () => {
  fresh();
  const root = join(TMP, 'proj-mphase');
  writeTL(root, 'r1', { verdict: 'GREEN', total_ms: 1000, phases: [
    { phase: 'apply', model: 'qwen36-msc1', provider: 'byok', tokens: { in: 10, out: 10 } },
    { phase: 'verify', model: 'claude-sonnet-4-6', provider: 'copilot', tokens: { in: 5, out: 5 } },
  ] });
  writeTL(root, 'r2', { verdict: 'NOT-GREEN', total_ms: 1000, phases: [
    { phase: 'apply', model: 'qwen36-msc1', provider: 'byok', tokens: { in: 8, out: 8 } },
  ] });
  const r = aggregateStats([{ root }]);
  assert(Array.isArray(r.byModelPhase), 'byModelPhase es array');
  const qwenApply = r.byModelPhase.find((mp) => mp.model === 'qwen36-msc1' && mp.phase === 'apply');
  eq(qwenApply.calls, 2, 'qwen apply: 2 llamadas (r1+r2)');
  eq(qwenApply.green, 1, 'qwen apply: solo 1 run fue GREEN');
  const sonnetVerify = r.byModelPhase.find((mp) => mp.model === 'claude-sonnet-4-6' && mp.phase === 'verify');
  eq(sonnetVerify.calls, 1, 'sonnet verify: 1 llamada');
  eq(sonnetVerify.green, 1, 'sonnet verify: 1 GREEN');
});
