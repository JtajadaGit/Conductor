// conductor/lib/stats.mjs — AGREGADOR de uso real (la mezcla qwen + Copilot, "como app"). Lee TODOS los
// timelines (.conductor/timeline.json) de uno o varios proyectos — activos y archivados — y resume el
// consumo por PROVEEDOR (byok/qwen-class $0 vs copilot/premium AIC) y por MODELO, con tokens, coste y el
// AHORRO frente a "todo premium" (pilar nº1: el ahorro VISIBLE en el punto de decisión). Sin API, sin LLM.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { priceOf } from './cost.mjs';
import { plumbPath } from './plumb.mjs';

const NAIVE = 'claude-opus-4-8'; // mismo baseline que cost.mjs: "qué costaría si TODO fuera el tope premium"
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const costOf = (m, i, o) => { const p = priceOf(m); return (i * p.in + o * p.out) / 1e6; };

// clasifica una fase como 'byok' (qwen-class, gratis) o 'copilot' (catálogo Business de pago). El proveedor
// declarado (parseModelSpec) manda; si falta, se infiere por el tier del modelo (lookup tolerante de cost.mjs).
function providerOf(ph) {
  if (ph.provider === 'byok' || ph.provider === 'copilot') return ph.provider;
  if (ph.provider) return ph.provider;
  const m = ph.model || ph.modelReported || '';
  return priceOf(m).tier === 'byok' ? 'byok' : 'copilot';
}

// enumera los change dirs de un root (openspec/changes/* + openspec/changes/archive/*), marcando archivados
function changeDirsOf(root) {
  const base = join(root, 'openspec', 'changes');
  const out = [];
  let entries = [];
  try { entries = readdirSync(base, { withFileTypes: true }); } catch { return out; }
  for (const d of entries) {
    if (!d.isDirectory()) continue;
    if (d.name === 'archive') {
      let arch = [];
      try { arch = readdirSync(join(base, 'archive'), { withFileTypes: true }); } catch {}
      for (const a of arch) if (a.isDirectory()) out.push({ dir: join(base, 'archive', a.name), name: a.name, archived: true });
    } else {
      out.push({ dir: join(base, d.name), name: d.name, archived: false });
    }
  }
  return out;
}

// agrega el uso a través de una lista de proyectos. `projects` = [{ id?, root }] (o strings de ruta).
export function aggregateStats(projects) {
  const list = (projects || []).map((p) => (typeof p === 'string' ? { root: p } : p)).filter((p) => p && p.root);
  const byProvider = Object.create(null); // provider -> acumulado (sin prototipo: un modelo "toString" no colisiona)
  const byModel = Object.create(null); // model -> acumulado
  const byModelPhase = new Map(); // "${model}|${phase}" -> { model, phase, calls, green, in, out }
  const perProject = [];
  let runs = 0, green = 0, failed = 0, stopped = 0, aborted = 0, running = 0, phasesTotal = 0, unpriced = 0;
  // T3: precisión del estimador — acumula est vs real SOLO en fases con tokens medidos y estimación presente
  const estAcc = { runs: 0, phases: 0, est: 0, real: 0, absErr: 0 };
  let msTotal = 0, msRuns = 0, tin = 0, tout = 0, cost = 0, naive = 0;
  let fixRuns = 0, recoveredRuns = 0; // self-repair: runs que tuvieron ≥1 ciclo fix y cuántos acabaron GREEN

  for (const proj of list) {
    let pRuns = 0, pGreen = 0, pFailed = 0, pPhases = 0, pIn = 0, pOut = 0, pCost = 0, pNaive = 0, pByok = 0, pCop = 0;
    for (const ch of changeDirsOf(proj.root)) {
      const tl = readJson(plumbPath(ch.dir, 'timeline.json'));
      if (!tl || !Array.isArray(tl.phases) || !tl.phases.length) continue;
      runs++; pRuns++;
      const v = String(tl.verdict || '').toUpperCase();
      if (v === 'GREEN') { green++; pGreen++; }
      else if (v === 'STOPPED' || v === 'DUPLICATE') stopped++;
      else if (v === 'ABORTED') { aborted++; failed++; pFailed++; }
      else if (v === 'RUNNING') running++;
      else { failed++; pFailed++; } // RED / desconocido cuentan como no-verde
      if (Number.isFinite(tl.total_ms) && tl.total_ms > 0) { msTotal += tl.total_ms; msRuns++; }
      // self-repair: el ciclo fix→verify recuperó el run sin humano (mide los "dientes" del gate). Timelines
      // antiguos sin selfRepair: fallback a contar las fases 'fix' presentes (recovered ≈ acabó GREEN).
      if (tl.estimate && Array.isArray(tl.estimate.phases)) {
        const em = new Map(tl.estimate.phases.map((p) => [p.phase, p]));
        const seenE = new Set(); let contributed = false;
        for (const ph of tl.phases) {
          if (!ph || seenE.has(ph.phase) || !ph.tokens || !em.has(ph.phase)) continue;
          seenE.add(ph.phase);
          const e = em.get(ph.phase);
          const est = (Number(e.estIn) || 0) + (Number(e.estOut) || 0);
          const real = (Number(ph.tokens.in) || 0) + (Number(ph.tokens.out) || 0);
          if (est <= 0 || real <= 0) continue;
          estAcc.phases++; estAcc.est += est; estAcc.real += real; estAcc.absErr += Math.abs(real - est) / est;
          contributed = true;
        }
        if (contributed) estAcc.runs++;
      }
      const sr = tl.selfRepair || (Array.isArray(tl.phases) ? { fixCycles: tl.phases.filter((p) => p && p.phase === 'fix').length, recovered: v === 'GREEN' && tl.phases.some((p) => p && p.phase === 'fix') } : {});
      if (Number(sr.fixCycles) > 0) { fixRuns++; if (sr.recovered) recoveredRuns++; }
      for (const ph of tl.phases) {
        if (!ph || typeof ph !== 'object') continue; // M8: un elemento null en phases reventaba la agregación (500 global)
        phasesTotal++; pPhases++;
        // M7/L23: coerción + clamp ≥0 — un tokens.in string ("lots") concatenaba → NaN en TODOS los proyectos
        const i = Math.max(0, Number(ph.tokens?.in) || 0), o = Math.max(0, Number(ph.tokens?.out) || 0);
        const m = ph.model || ph.modelReported || '(modelo de la sesión)'; // fase sin modelo explícito = corrió con el de la sesión del host
        const prov = providerOf(ph);
        const c = costOf(m, i, o), nc = costOf(NAIVE, i, o);
        if (!priceOf(m).known) unpriced++; // HONESTIDAD: fase con modelo sin precio conocido → el total la excluye y se declara
        tin += i; tout += o; cost += c; naive += nc;
        pIn += i; pOut += o; pCost += c; pNaive += nc;
        if (prov === 'byok') pByok++; else pCop++;
        const bp = (byProvider[prov] ||= { provider: prov, calls: 0, in: 0, out: 0, cost: 0, naive: 0, models: new Set() });
        bp.calls++; bp.in += i; bp.out += o; bp.cost += c; bp.naive += nc; if (ph.model || ph.modelReported) bp.models.add(m);
        const bm = (byModel[m] ||= { model: m, providers: new Set(), calls: 0, in: 0, out: 0, cost: 0, naive: 0 });
        bm.calls++; bm.in += i; bm.out += o; bm.cost += c; bm.naive += nc; bm.providers.add(prov);
        if (ph.phase) { const mpk = `${m}|${ph.phase}`; const mp = (byModelPhase.has(mpk) ? byModelPhase.get(mpk) : byModelPhase.set(mpk, { model: m, phase: ph.phase, calls: 0, green: 0, in: 0, out: 0 }).get(mpk)); mp.calls++; mp.in += i; mp.out += o; if (v === 'GREEN') mp.green++; }
      }
    }
    if (pRuns) perProject.push({
      id: proj.id || null, root: proj.root, runs: pRuns, green: pGreen, failed: pFailed,
      phases: pPhases, byok_phases: pByok, copilot_phases: pCop,
      in: pIn, out: pOut, cost_usd: +pCost.toFixed(4), naive_usd: +pNaive.toFixed(4),
      saved_pct: pNaive > 0 ? Math.max(0, +(((pNaive - pCost) / pNaive) * 100).toFixed(1)) : 0,
    });
  }

  const saved = Math.max(0, naive - cost); // L24: nunca "ahorro" negativo en la tarjeta de ahorro
  const estimator = estAcc.phases
    ? { runs: estAcc.runs, phases: estAcc.phases, dev_pct: Math.round(((estAcc.real / estAcc.est) - 1) * 100), mape_pct: Math.round((estAcc.absErr / estAcc.phases) * 100) }
    : null; // sin datos no se inventa precisión (honestidad)
  return {
    estimator,
    projects_scanned: list.length,
    runs, green, failed, stopped, aborted, running, phases: phasesTotal,
    mean_ms: msRuns ? Math.round(msTotal / msRuns) : 0,
    tokens: { in: tin, out: tout },
    selfRepair: { runs_with_fix: fixRuns, recovered: recoveredRuns, rate_pct: fixRuns > 0 ? +((recoveredRuns / fixRuns) * 100).toFixed(1) : 0 },
    cost_usd: +cost.toFixed(4), naive_all_premium_usd: +naive.toFixed(4), unpriced,
    saved_usd: +saved.toFixed(4), saved_pct: naive > 0 ? +((saved / naive) * 100).toFixed(1) : 0,
    byProvider: Object.values(byProvider)
      .map((v) => ({ provider: v.provider, calls: v.calls, in: v.in, out: v.out, models: [...v.models], cost_usd: +v.cost.toFixed(4), naive_usd: +v.naive.toFixed(4) }))
      .sort((a, b) => b.calls - a.calls),
    byModel: Object.values(byModel)
      // provider = todos los proveedores con los que se usó ESTE modelo (no solo el primero): un mismo id
      // puede correr vía byok Y vía copilot en runs distintos → "byok+copilot" en vez de bloquear al 1º.
      .map((v) => ({ model: v.model, provider: [...v.providers].join('+'), calls: v.calls, in: v.in, out: v.out, cost_usd: +v.cost.toFixed(4), naive_usd: +v.naive.toFixed(4) }))
      .sort((a, b) => b.calls - a.calls),
    byModelPhase: [...byModelPhase.values()].sort((a, b) => a.model.localeCompare(b.model) || a.phase.localeCompare(b.phase)),
    perProject: perProject.sort((a, b) => b.runs - a.runs),
  };
}
