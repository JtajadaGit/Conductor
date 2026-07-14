// conductor/lib/pipeline/ttypause.mjs — PAUSAS DE REVISIÓN EN TERMINAL (la vía dev-first sin web).
// El driver pausa antes de apply/verify (o fix) y, sin mini-web ni IPC, el dev decide EN SU CONSOLA:
// aprobar · nota · modelo · rehacer fase (chat-en-pausa) · stop — las MISMAS decisiones que la web, mismo
// contrato de resolución de onPause ({} | {note} | {model} | {redo,note} | {selected} | {stop}). Factoría con
// `ask` inyectable → 100% testeable sin TTY real. 0 deps.

// normaliza la respuesta corta del dev ("a", "", "s", "nota …") a una ACCIÓN
export function parseChoice(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === '' || s === 'a' || s === 'aprobar' || s === 'y' || s === 'yes') return 'approve';
  if (s === 'n' || s === 'nota' || s === 'note') return 'note';
  if (s === 'm' || s === 'modelo' || s === 'model') return 'model';
  if (s === 'r' || s === 'rehacer' || s === 'redo') return 'redo';
  if (s === 's' || s === 'stop' || s === 'q') return 'stop';
  if (/^[\d\s,]+$/.test(s)) return 'select'; // "1,3" → selección de hallazgos (pausa fix)
  return null; // no reconocido → re-preguntar
}

// "1, 3" → índices 0-based válidos contra la lista de hallazgos (dedup, orden estable)
export function parseSelection(raw, findingsCount) {
  const idx = [...new Set(String(raw || '').split(/[\s,]+/).filter(Boolean).map((x) => Number(x) - 1))]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < findingsCount).sort((a, b) => a - b);
  return idx;
}

// crea el onPause de terminal. deps: ask(pregunta) → Promise<string> · log(línea). serveUrl opcional (se
// imprime como alternativa rica). El bucle re-pregunta ante entrada no reconocida (nunca aprueba por typo).
export function createTtyPause({ ask, log, serveUrl = '' }) {
  return async (info) => {
    const phase = info?.before || '?';
    const findings = Array.isArray(info?.findings) ? info.findings : [];
    log('');
    log(`⏸ REVISIÓN — pausado antes de "${phase}"${serveUrl ? `  (revisión rica: ${serveUrl})` : ''}`);
    if (findings.length) {
      log('  hallazgos del gate:');
      findings.forEach((f, i) => log(`   ${i + 1}. [${f.severity || 'info'}] ${f.message}${f.file ? ` — ${f.file}` : ''}`));
    }
    for (;;) {
      const menu = findings.length
        ? '[Enter=corregir todos · 1,3=solo esos · n=nota · m=modelo · s=stop] '
        : '[Enter=aprobar · n=nota · m=modelo · r=rehacer fase · s=stop] ';
      const raw = await ask(`  decisión ${menu}`);
      const choice = parseChoice(raw);
      if (choice === 'approve') return {};
      if (choice === 'stop') return { stop: true };
      if (choice === 'select' && findings.length) {
        const selected = parseSelection(raw, findings.length);
        if (selected.length) return { selected };
        log('  ⚠ ningún número válido — usa índices de la lista (p. ej. "1,3")');
        continue;
      }
      if (choice === 'note') {
        const note = String(await ask('  nota para esta fase: ')).trim();
        if (note) return { note };
        log('  ⚠ nota vacía — nada que enviar'); continue;
      }
      if (choice === 'model') {
        const model = String(await ask('  modelo para esta fase (proveedor:modelo, p. ej. byok:qwen…): ')).trim();
        if (model) return { model };
        log('  ⚠ modelo vacío'); continue;
      }
      if (choice === 'redo') {
        if (findings.length) { log('  ⚠ en la pausa de fix se corrigen hallazgos, no se rehace el plan'); continue; }
        const redo = String(await ask('  fase de planificación a rehacer (explore/propose/clarify/spec/design/tasks): ')).trim().toLowerCase();
        if (!redo) { log('  ⚠ fase vacía'); continue; }
        const note = String(await ask('  instrucción para el redo (obligatoria): ')).trim();
        if (!note) { log('  ⚠ el redo sin instrucción no aporta — escribe qué debe cambiar'); continue; }
        return { redo, note };
      }
      log('  ⚠ no te he entendido — Enter aprueba; s detiene');
    }
  };
}
