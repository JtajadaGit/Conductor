// model-validation-before-send: la validación pura de modelos byok: contra el catálogo.
// + registro de proyectos atómico/validado (Ola 1: projects-registry-recovery).
import { checkByokModels, saveRegistry, loadRegistry, aggregateArchive, aggregateSearch, isCopilotFamily } from '../lib/serving/serve.mjs';
import { scrubSecrets } from '../lib/pipeline/drive.mjs';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REG_HOME = join(dirname(fileURLToPath(import.meta.url)), '.tmp-reg-home');
const withRegHome = (fn) => {
  const prev = process.env.CONDUCTOR_HOME;
  rmSync(REG_HOME, { recursive: true, force: true }); mkdirSync(REG_HOME, { recursive: true });
  process.env.CONDUCTOR_HOME = REG_HOME;
  try { fn(); } finally { if (prev === undefined) delete process.env.CONDUCTOR_HOME; else process.env.CONDUCTOR_HOME = prev; rmSync(REG_HOME, { recursive: true, force: true }); }
};

await test('registry: saveRegistry dedup por id (último gana) + loadRegistry round-trip', () => {
  withRegHome(() => {
    const r1 = join(REG_HOME, 'p1'); mkdirSync(r1, { recursive: true });
    saveRegistry([{ id: 'a~1', root: r1, name: 'p1' }, { id: 'a~1', root: r1, name: 'p1-dup' }]);
    const loaded = loadRegistry();
    eq(loaded.length, 1, 'dedup por id');
    eq(loaded[0].name, 'p1-dup', 'último gana');
  });
});

await test('registry: loadRegistry descarta roots inexistentes (proyectos fantasma)', () => {
  withRegHome(() => {
    const alive = join(REG_HOME, 'alive'); mkdirSync(alive, { recursive: true });
    saveRegistry([{ id: 'al~1', root: alive, name: 'alive' }, { id: 'dead~1', root: join(REG_HOME, 'nope'), name: 'dead' }]);
    const loaded = loadRegistry();
    eq(loaded.length, 1, 'solo el root vivo sobrevive a la lectura');
    eq(loaded[0].name, 'alive');
  });
});

await test('checkByokModels: byok existente → ok', () => {
  eq(checkByokModels({ planner: 'byok:qwen-a' }, ['qwen-a', 'qwen-b'], true), { ok: true });
});
await test('checkByokModels: byok inexistente CON credenciales → 400 con motivo', () => {
  const r = checkByokModels({ coder: 'byok:typo' }, ['qwen-a', 'qwen-b'], true);
  assert(r.ok === false, 'bloquea el inexistente');
  assert(/typo/.test(r.error) && /qwen-a/.test(r.error), 'el error nombra el modelo y los disponibles');
});
await test('checkByokModels: SIN credenciales no bloquea (no se puede validar fiable)', () => {
  eq(checkByokModels({ coder: 'byok:typo' }, ['qwen-a'], false), { ok: true });
});
await test('checkByokModels: lista byok vacía no bloquea (degradar, no 400)', () => {
  eq(checkByokModels({ coder: 'byok:typo' }, [], true), { ok: true });
});
await test('checkByokModels: copilot: y sin prefijo NO se validan', () => {
  eq(checkByokModels({ coder: 'copilot:lo-que-sea', planner: 'gpt-x' }, ['qwen-a'], true), { ok: true });
});
await test('checkByokModels: sin models → ok', () => {
  eq(checkByokModels(undefined, ['qwen-a'], true), { ok: true });
});

// ── búsqueda/archivo AGREGADOS sobre varios proyectos (coherente con la lista multi-proyecto del panel) ──
function mkChange(root, name, request) {
  const cd = join(root, 'openspec', 'changes', name, '.conductor');
  mkdirSync(cd, { recursive: true });
  writeFileSync(join(cd, 'timeline.json'), JSON.stringify({ request, verdict: 'GREEN', phases: [{ phase: 'spec' }] }));
}

await test('aggregate: búsqueda multi-proyecto etiqueta cada hit con su proyecto', () => {
  withRegHome(() => {
    const a = join(REG_HOME, 'pa'); const b = join(REG_HOME, 'pb');
    mkdirSync(a, { recursive: true }); mkdirSync(b, { recursive: true });
    mkChange(a, 'login-flow', 'implementar login con OAuth');
    mkChange(b, 'login-form', 'formulario de login accesible');
    const projects = [{ id: 'pa~1', name: 'pa', root: a }, { id: 'pb~1', name: 'pb', root: b }];
    const hits = aggregateSearch(projects, 'login');
    eq(hits.length, 2, 'encuentra en ambos proyectos');
    assert(hits.every((h) => h.project && h.projectId), 'cada hit lleva proyecto + projectId para enlazar al run correcto');
    assert(hits.some((h) => h.project === 'pa') && hits.some((h) => h.project === 'pb'), 'cubre los dos proyectos');
  });
});

await test('aggregate: archivo multi-proyecto separa fecha/nombre y etiqueta proyecto', () => {
  withRegHome(() => {
    const a = join(REG_HOME, 'pa'); mkdirSync(a, { recursive: true });
    mkChange(a, join('archive', '2026-01-02-old-thing'), 'algo viejo ya archivado');
    const arch = aggregateArchive([{ id: 'pa~1', name: 'pa', root: a }]);
    eq(arch.length, 1, 'lista el cambio archivado');
    eq(arch[0].project, 'pa');
    eq(arch[0].date, '2026-01-02', 'extrae la fecha del nombre de carpeta');
    eq(arch[0].name, 'old-thing', 'separa el nombre de la fecha');
  });
});

// ── HARDENING (auditoría de seguridad) ────────────────────────────────────────────────────────────
// Bug "sonnet dentro de BYOK": el grupo BYOK es proveedor propio (qwen/deepseek/…); jamás un modelo
// Copilot por cache vieja o run mal marcado. isCopilotFamily es el filtro — debe acertar sin falsos +.
await test('isCopilotFamily: detecta familia Copilot y NO toca qwen/deepseek', () => {
  for (const id of ['claude-sonnet-4.6', 'claude-opus-4.8', 'claude-haiku-4.5', 'gpt-4o', 'gpt-5', 'gemini-1.5-pro', 'o1', 'o3', 'grok-2', 'litellm/claude-sonnet'])
    assert(isCopilotFamily(id), `${id} debe clasificarse como Copilot`);
  for (const id of ['qwen36-msc1', 'qwen36-msc2', 'deepseek-v4-flash', 'qwen3-omni', 'mistral-large', ''])
    assert(!isCopilotFamily(id), `${id} NO debe clasificarse como Copilot (falso positivo)`);
});

// Fuga de secreto vía stderr→timeline→/api/state: el stderr del agente se redacta en ORIGEN. Verifica
// que un "Bearer <key>" / "sk-…" embebido en un volcado de error queda redactado (lo que se persiste en
// timeline.json y se sirve sin re-scrubear). Mismos patrones que protegen /api/raw y /api/events.
await test('scrubSecrets: redacta Bearer/sk- en un volcado de error de stderr', () => {
  const leak = 'connect ECONNREFUSED; req headers: Authorization: Bearer sk-abc123DEF456ghi · token sk-LIVE_7h3Xk9qZ';
  const safe = scrubSecrets(leak);
  assert(!/sk-abc123DEF456ghi/.test(safe), 'la key tras Bearer queda redactada');
  assert(!/sk-LIVE_7h3Xk9qZ/.test(safe), 'el token sk- suelto queda redactado');
  assert(/ECONNREFUSED/.test(safe), 'conserva el contexto NO sensible del error');
});

// ── B5 (plan expertise 2026-07-17): guardar la mezcla de modelos como DEFAULT del proyecto ──
await test('models-default: crea conductor.json si falta y guarda SOLO la seccion models (roles y fases)', async () => {
  const { mergeModelsDefault } = await import('../lib/serving/serve.mjs');
  const { readFileSync, existsSync } = await import('node:fs');
  const T = join(dirname(fileURLToPath(import.meta.url)), '.tmp-mdl-default');
  rmSync(T, { recursive: true, force: true }); mkdirSync(join(T, 'openspec'), { recursive: true });
  const r = mergeModelsDefault(join(T, 'openspec'), { planner: 'litellm:glm-v52', explore: 'litellm:deepseek-v4-flash', hacker: 'byok:evil' });
  eq(r.ok, true);
  const cfg = JSON.parse(readFileSync(join(T, 'openspec', 'conductor.json'), 'utf8'));
  eq(cfg.models.planner, 'litellm:glm-v52', 'rol guardado');
  eq(cfg.models.explore, 'litellm:deepseek-v4-flash', 'clave de FASE guardada (models.<fase> gana al rol en el driver)');
  assert(!('hacker' in (cfg.models || {})), 'claves fuera de la allowlist se descartan');
  assert(existsSync(join(T, 'openspec', 'conductor.schema.json')), 'el schema del editor tambien queda (initConfig)');
  rmSync(T, { recursive: true, force: true });
});

await test('models-default: merge CONSERVADOR — no pisa otras claves; vacio borra la clave (vuelve a Recomendado); JSON roto NO se toca', async () => {
  const { mergeModelsDefault } = await import('../lib/serving/serve.mjs');
  const { readFileSync } = await import('node:fs');
  const T = join(dirname(fileURLToPath(import.meta.url)), '.tmp-mdl-default2');
  rmSync(T, { recursive: true, force: true }); mkdirSync(join(T, 'openspec'), { recursive: true });
  writeFileSync(join(T, 'openspec', 'conductor.json'), JSON.stringify({ timeoutSeconds: 300, models: { coder: 'copilot:claude-haiku-4.5', planner: 'litellm:viejo' } }));
  const r = mergeModelsDefault(join(T, 'openspec'), { planner: 'litellm:glm-v52', coder: '' });
  eq(r.ok, true);
  const cfg = JSON.parse(readFileSync(join(T, 'openspec', 'conductor.json'), 'utf8'));
  eq(cfg.timeoutSeconds, 300, 'las claves ajenas a models sobreviven');
  eq(cfg.models.planner, 'litellm:glm-v52', 'la clave enviada se actualiza');
  assert(!('coder' in cfg.models), "'' borra la clave: esa fase/rol vuelve al recomendado");
  // JSON roto → error claro y CERO escritura
  writeFileSync(join(T, 'openspec', 'conductor.json'), '{ roto');
  const bad = mergeModelsDefault(join(T, 'openspec'), { planner: 'x' });
  eq(bad.ok, false);
  eq(readFileSync(join(T, 'openspec', 'conductor.json'), 'utf8'), '{ roto', 'el fichero roto queda INTACTO (no lo piso)');
  rmSync(T, { recursive: true, force: true });
});
