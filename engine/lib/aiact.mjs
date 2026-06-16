// conductor/lib/aiact.mjs — ⭐ AI ACT PACK (EU AI Act: transparencia de contenido generado por IA,
// en vigor 2-ago-2026). Genera el INFORME DE CUMPLIMIENTO de un change: qué generó la IA, con qué
// modelos, quién lo aprobó (humano), qué verificación determinista pasó y con qué firma — el documento
// que un responsable enseña a un auditor. La EVIDENCIA es técnica y verificable; el mapping legal se
// etiqueta como basado en el DRAFT Code of Practice (sujeto a finalización). NO es asesoría legal.
//
// Enfoque multi-capa del draft CoP → conductor ya lo cumple por diseño:
//   metadata (provenance.json firmado) + marca en contenido (@conductor REQ-x en cada archivo) +
//   logging/fingerprint (ledger hash-encadenado). Este informe lo consolida y lo hace LEGIBLE.
import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { THEME } from './theme.mjs';

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const sha = (p) => { try { return createHash('sha256').update(readFileSync(p)).digest('hex'); } catch { return null; } };
const E = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function aiactData(changeDir) {
  const tl = readJson(join(changeDir, '.conductor', 'timeline.json')) ?? readJson(join(changeDir, 'run-timeline.json'));
  if (!tl) throw new Error('sin timeline — el change no tiene runs registrados');
  const prov = readJson(join(changeDir, 'provenance.json'));
  const specPath = (() => {
    // la spec delta del change: specs/<dominio>/spec.md
    try {
      const specsDir = join(changeDir, 'specs');
      for (const d of readdirSync(specsDir)) if (existsSync(join(specsDir, d, 'spec.md'))) return join(specsDir, d, 'spec.md');
    } catch {}
    return null;
  })();
  const aiFiles = [];
  for (const ph of tl.phases ?? []) {
    if (ph.phase !== 'apply' && ph.phase !== 'fix') continue;
    for (const f of ph.files ?? []) aiFiles.push({ p: typeof f === 'string' ? f : f.p, k: typeof f === 'string' ? 'create' : f.k, phase: ph.phase });
  }
  return {
    change: basename(changeDir),
    request: tl.request || null,
    verdict: tl.verdict || null,
    generatedAt: new Date().toISOString(),
    spec: specPath ? { path: specPath.replace(/\\/g, '/').split('/').slice(-3).join('/'), sha256: sha(specPath) } : null,
    models: (tl.phases ?? []).filter((p) => p.model).map((p) => ({ phase: p.phase, model: p.model, provider: p.provider || null, tokens: p.tokens || null })),
    approvals: tl.approvals ?? [],
    aiGeneratedFiles: aiFiles,
    verification: {
      gate: tl.verdict === 'GREEN' ? 'PASS (deterministic gate: coherence + artifacts + traceability)'
        : tl.verdict === 'ABORTED' ? 'NO COMPLETADO - una fase aborto; sin veredicto del gate'
        : tl.verdict === 'STOPPED' ? 'DETENIDO por el usuario antes de completar la verificacion'
        : 'RUN INTERRUMPIDO - sin veredicto del gate todavia (reanudable)',
      lenses: (tl.phases ?? []).find((p) => p.lenses)?.lenses ?? null,
    },
    provenance: prov ? { algo: prov.algo || prov.signature?.algo || null, sealedAt: prov.sealed_at || prov.at || null, verifiable: true } : null,
    marking: { metadata: !!prov, inContent: '@conductor REQ-<id> comment in every AI-written file', logging: existsSync(join(changeDir, '..', '..', 'provenance.ledger.jsonl')) ? 'hash-chained ledger' : null },
  };
}

export function renderAiact(changeDir) {
  const d = aiactData(changeDir);
  const vc = d.verdict === 'GREEN' ? 'GREEN' : (d.verdict === 'ABORTED' || d.verdict === 'STOPPED' ? d.verdict : 'INTERRUMPIDO');
  const models = d.models.map((m) => `<tr><td><code>${E(m.phase)}</code></td><td><b>${E(m.model)}</b></td><td style="color:var(--tx3)">${E(m.provider || '—')}</td><td style="font-variant-numeric:tabular-nums">${m.tokens ? `↓${m.tokens.in} ↑${m.tokens.out}` : '—'}</td></tr>`).join('');
  const apps = d.approvals.length
    ? d.approvals.map((a) => `<li>fase <code>${E(a.phase)}</code> — aprobada por <b>una persona</b> (${E(a.via)}) el ${E(a.at)}</li>`).join('')
    : '<li style="color:var(--tx3)">sin pausas de revisión en este run (modo autoApprove)</li>';
  const files = d.aiGeneratedFiles.map((f) => `<li><code>${E(f.p)}</code> <span style="color:var(--tx3);font-size:.85em">${E(f.k)} · ${E(f.phase)}</span></li>`).join('') || '<li style="color:var(--tx3)">ninguno registrado</li>';
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>conductor · AI Act · ${E(d.change)}</title>
<style>${THEME}
 body{max-width:860px;margin:0 auto;padding:1.6rem 1.4rem 4rem}
 .head{display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;margin-bottom:.2rem}
 .logo{width:26px;height:26px;border-radius:7px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem}
 .sub{color:var(--tx2);font-size:.85rem;margin:.2rem 0 1.2rem}
 .box{border:1px solid var(--bd);border-radius:var(--r);padding:.85rem 1rem;margin:.5rem 0;background:var(--card);box-shadow:var(--sh)}
 .kv{display:grid;grid-template-columns:auto 1fr;gap:.3rem .9rem;font-size:.88rem} .kv dt{color:var(--tx2)} .kv dd{margin:0}
 ul{margin:.4rem 0;padding-left:1.2rem} li{margin:.2rem 0}
</style>
<div class=head><span class=logo>C</span><h1>Informe de transparencia de IA</h1><span class="pill ${vc}">${E(d.verdict || '—')}</span></div>
<p class=sub>Qué generó la IA, con qué modelos, quién lo aprobó y qué verificación pasó — evidencia técnica alineada con el EU AI Act (transparencia de contenido IA, en vigor el 2-ago-2026).</p>
<div class=box><dl class=kv>
<dt>Cambio</dt><dd><b>${E(d.change)}</b></dd>
<dt>Petición</dt><dd>${E(d.request)}</dd>
<dt>Generado</dt><dd>${E(d.generatedAt)} · por <b>conductor</b></dd>
${d.spec ? `<dt>Especificación</dt><dd><code>${E(d.spec.path)}</code><br><small style="color:var(--tx3)">sha256 ${E((d.spec.sha256 || '').slice(0, 16))}…</small></dd>` : ''}
</dl></div>
<h2 class=sect>1 · Modelos de IA empleados <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--tx3)">— qué modelo generó cada fase (base de la trazabilidad)</span></h2>
${models ? `<table><tr><th>fase</th><th>modelo</th><th>proveedor</th><th>tokens</th></tr>${models}</table>` : '<p style="color:var(--tx3)">sin telemetría de modelo</p>'}
<h2 class=sect>2 · Supervisión humana <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--tx3)">— cada pausa aprobada por una persona (control humano exigido)</span></h2><ul>${apps}</ul>
<h2 class=sect>3 · Archivos generados por IA <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--tx3)">— inventario exacto, marcados con @conductor REQ-&lt;id&gt;</span></h2><ul>${files}</ul>
<h2 class=sect>4 · Verificación <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--tx3)">— gate determinista, sin LLM</span></h2>
<div class=box>${E(d.verification.gate)}${d.verification.lenses ? `<br><small style="color:var(--tx2)">Review multi-lente: ${d.verification.lenses.map((l) => `<code>${E(l)}</code>`).join(' ')}</small>` : ''}<br><small style="color:var(--tx3)">Los tests/build del proyecto se ejecutan en el CI del repositorio.</small></div>
<h2 class=sect>5 · Procedencia firmada y registro <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--tx3)">— integridad criptográfica verificable</span></h2>
<div class=box>${d.provenance ? `Sello <b>${E(d.provenance.algo || 'Ed25519')}</b>${d.provenance.sealedAt ? ` · ${E(d.provenance.sealedAt)}` : ''} — verificable con <code>conductor verify</code>.` : '<span style="color:var(--warn)">Sin sello todavía (se genera al cerrar GREEN).</span>'}${d.marking.logging ? `<br>Registro encadenado: <b>${E(d.marking.logging)}</b> — <code>conductor ledger verify</code>.` : ''}</div>
<footer>Evidencia técnica generada por conductor como subproducto del pipeline. El mapeo a las obligaciones del EU AI Act se basa en el <b>draft</b> Code of Practice (en finalización) y <b>no constituye asesoramiento legal</b>.</footer>
</html>`;
}

export function writeAiact(changeDir, outPath) {
  const html = renderAiact(changeDir);
  const out = outPath || join(changeDir, 'aiact-report.html');
  writeFileSync(out, html);
  return out;
}
