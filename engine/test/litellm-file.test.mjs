// CONTRATO litellm.json (feedback real: "¿por qué byok.json y no litellm.json? ¿por qué no lo recreamos
// como mi opencode.json?"): el fichero user-facing es ~/.conductor/litellm.json con el MISMO gesto que la
// config de OpenCode ({baseUrl, apiKey, models?}); los modelos DECLARADOS mandan en el picker (no dependen
// del proxy vivo); byok.json queda como legado leíble; "litellm:" = alias del prefijo "byok:" en modelos.
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { byokCreds, parseModelSpec } from '../lib/pipeline/drive.mjs';
import { byokFile } from '../lib/provenance/secret.mjs';
import { byokDeclaredModels, checkByokModels } from '../lib/serving/serve.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(HERE, '..', 'bin', 'conductor.mjs');

await test('litellm: el prefijo "litellm:<m>" es alias EXACTO de "byok:<m>" (mismo proveedor, mismo modelo)', () => {
  eq(parseModelSpec('litellm:glm-v52'), { model: 'glm-v52', provider: 'byok' });
  eq(parseModelSpec('byok:glm-v52'), { model: 'glm-v52', provider: 'byok' });
  eq(parseModelSpec('copilot:claude-haiku-4.5'), { model: 'claude-haiku-4.5', provider: 'copilot' });
});

await test('litellm: checkByokModels valida también los "litellm:" (mismo gate que byok:)', () => {
  eq(checkByokModels({ coder: 'litellm:glm-v52' }, ['glm-v52'], true).ok, true);
  eq(checkByokModels({ coder: 'litellm:no-existe' }, ['glm-v52'], true).ok, false, 'modelo inexistente → bloquea');
});

await test('litellm-file: byok.json LEGADO se sigue leyendo; litellm.json GANA si existen ambos', () => {
  const home = join(HERE, '.tmp-litellm-compat');
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'byok.json'), JSON.stringify({ baseUrl: 'http://legado:9/v1', apiKey: 'sk-legado' }));
  eq(byokCreds({ CONDUCTOR_HOME: home }).baseUrl, 'http://legado:9/v1', 'el legado funciona (nadie se queda tirado)');
  writeFileSync(join(home, 'litellm.json'), JSON.stringify({ baseUrl: 'http://nuevo:9/v1', apiKey: 'sk-nuevo' }));
  assert(byokFile(home).endsWith('litellm.json'), 'litellm.json es el canónico cuando existe');
  eq(byokCreds({ CONDUCTOR_HOME: home }).baseUrl, 'http://nuevo:9/v1', 'y sus credenciales mandan');
  rmSync(home, { recursive: true, force: true });
});

await test('litellm-file: los modelos DECLARADOS (patrón OpenCode) salen del fichero — mapa u array, con límites', () => {
  const home = join(HERE, '.tmp-litellm-decl');
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  const prev = process.env.CONDUCTOR_HOME;
  process.env.CONDUCTOR_HOME = home;
  try {
    writeFileSync(join(home, 'litellm.json'), JSON.stringify({
      baseUrl: 'http://x:9/v1', apiKey: 'sk-x',
      models: { 'deepseek-v4-flash': {}, 'deepseek-v4-flash-max': { maxOutputTokens: 32768, maxInputTokens: 128000 }, 'glm-v52': { name: 'GLM 5.2', limit: { context: 250000, output: 16384 } } },
    }));
    const d = byokDeclaredModels();
    eq(d.ids.sort(), ['deepseek-v4-flash', 'deepseek-v4-flash-max', 'glm-v52'], 'ids del mapa');
    eq(d.meta['deepseek-v4-flash-max'], { maxOut: 32768, maxIn: 128000 }, 'límites por modelo → meta del picker');
    eq(d.meta['glm-v52'], { maxOut: 16384, maxIn: 250000 }, 'la forma OpenCode limit.{context,output} también vale (copia tal cual)');
    writeFileSync(join(home, 'litellm.json'), JSON.stringify({ baseUrl: 'http://x:9/v1', apiKey: 'sk-x', models: ['glm-v52'] }));
    eq(byokDeclaredModels().ids, ['glm-v52'], 'también acepta array simple');
    writeFileSync(join(home, 'litellm.json'), JSON.stringify({ baseUrl: 'http://x:9/v1', apiKey: 'sk-x' }));
    eq(byokDeclaredModels().ids, [], 'sin "models" → vacío (no inventa)');
  } finally {
    if (prev === undefined) delete process.env.CONDUCTOR_HOME; else process.env.CONDUCTOR_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
});

await test('litellm-file: renovar la key (CLI `litellm save`) CONSERVA los modelos declarados a mano', () => {
  const home = join(HERE, '.tmp-litellm-keep');
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'litellm.json'), JSON.stringify({ baseUrl: 'http://x:9/v1', apiKey: 'sk-vieja', models: { 'glm-v52': {} } }));
  execFileSync(process.execPath, [BIN, 'litellm', 'save'], {
    env: { ...process.env, CONDUCTOR_HOME: home, COPILOT_PROVIDER_BASE_URL: 'http://x:9/v1', COPILOT_PROVIDER_API_KEY: 'sk-nueva' },
    stdio: 'pipe', windowsHide: true, timeout: 30000,
  });
  const j = JSON.parse(readFileSync(join(home, 'litellm.json'), 'utf8'));
  assert(j.apiKeyEnc && !j.apiKey, 'key nueva cifrada');
  eq(Object.keys(j.models ?? {}), ['glm-v52'], 'los modelos declarados SOBREVIVEN a la renovación');
  rmSync(home, { recursive: true, force: true });
});

await test('litellm-plantilla: la plantilla de setup SIN rellenar jamas cuenta como credenciales ni catalogo ni se cifra', async () => {
  const { LITELLM_TEMPLATE, isTemplateCreds, sealByokFile } = await import('../lib/provenance/secret.mjs');
  const { byokDeclaredModels } = await import('../lib/serving/serve.mjs');
  const home = join(HERE, '.tmp-litellm-tpl');
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  const prev = process.env.CONDUCTOR_HOME;
  process.env.CONDUCTOR_HOME = home;
  try {
    writeFileSync(join(home, 'litellm.json'), JSON.stringify(LITELLM_TEMPLATE, null, 2));
    assert(isTemplateCreds(LITELLM_TEMPLATE), 'la plantilla se auto-detecta');
    eq(byokCreds({ CONDUCTOR_HOME: home }), null, 'plantilla != credenciales (nada de llamar al proxy con sk-PEGA-AQUI)');
    eq(byokDeclaredModels().ids, [], 'el "mi-modelo" de ejemplo NO sale en el selector');
    eq(sealByokFile(home), false, 'el sellado NO cifra placeholders');
    const j = JSON.parse(readFileSync(join(home, 'litellm.json'), 'utf8'));
    assert(j.apiKey && !j.apiKeyEnc, 'la plantilla queda intacta para que el usuario la rellene');
    // rellenada de verdad -> todo vuelve a la normalidad
    writeFileSync(join(home, 'litellm.json'), JSON.stringify({ ...LITELLM_TEMPLATE, baseUrl: 'http://real:9/v1', apiKey: 'sk-real-123' }));
    eq(byokCreds({ CONDUCTOR_HOME: home }).apiKey, 'sk-real-123', 'rellenada -> credenciales normales');
  } finally {
    if (prev === undefined) delete process.env.CONDUCTOR_HOME; else process.env.CONDUCTOR_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
});

await test('litellm-compat: el bloque de proveedor de OpenCode PEGADO TAL CUAL funciona (options.baseURL/apiKey/timeouts) y el sellado lo respeta', async () => {
  const { sealByokFile, normalizeByokShape } = await import('../lib/provenance/secret.mjs');
  const { byokDeclaredModels } = await import('../lib/serving/serve.mjs');
  const home = join(HERE, '.tmp-litellm-ocshape');
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  const prev = process.env.CONDUCTOR_HOME;
  process.env.CONDUCTOR_HOME = home;
  try {
    writeFileSync(join(home, 'litellm.json'), JSON.stringify({
      npm: '@ai-sdk/openai-compatible', name: 'LiteLLM',
      seal: true, // el sellado es OPT-IN desde 2026-07-31 (paridad OpenCode); este test prueba el MECANISMO
      options: { baseURL: 'https://proxy.corp', apiKey: 'sk-real-abc', headerTimeout: 15000, chunkTimeout: 60000, timeout: 300000 },
      models: { 'glm-v52': { name: 'GLM 5.2', limit: { context: 250000, output: 16384 } } },
    }));
    const c = byokCreds({ CONDUCTOR_HOME: home });
    eq(c.baseUrl, 'https://proxy.corp', 'baseURL (camel, sin /v1, dentro de options) se normaliza');
    eq(c.apiKey, 'sk-real-abc', 'la key sale de options');
    eq(byokDeclaredModels().ids, ['glm-v52'], 'los models del bloque salen en el selector');
    assert(sealByokFile(home), 'sella tambien con la key dentro de options');
    const j = JSON.parse(readFileSync(join(home, 'litellm.json'), 'utf8'));
    assert(j.apiKeyEnc && !j.apiKey && !(j.options || {}).apiKey, 'key cifrada al top; en claro no queda en NINGUN sitio');
    eq(j.options.timeout, 300000, 'los timeouts del dev sobreviven al sellado');
    eq(byokCreds({ CONDUCTOR_HOME: home }).apiKey, 'sk-real-abc', 're-lectura tras sellar');
    eq(normalizeByokShape({ baseURL: 'https://x' }).baseUrl, 'https://x', 'alias baseURL tambien al top-level');
  } finally {
    if (prev === undefined) delete process.env.CONDUCTOR_HOME; else process.env.CONDUCTOR_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
});

await test('litellm-seal: EN CLARO es el DEFAULT (paridad OpenCode) — sin "seal" ni con "seal": false se toca nada', async () => {
  const { sealByokFile } = await import('../lib/provenance/secret.mjs');
  const home = join(HERE, '.tmp-litellm-optout');
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  try {
    writeFileSync(join(home, 'litellm.json'), JSON.stringify({ baseUrl: 'https://proxy.corp/v1', apiKey: 'sk-clear-9999' }));
    eq(sealByokFile(home), false, 'DEFAULT: no se sella');
    writeFileSync(join(home, 'litellm.json'), JSON.stringify({ baseUrl: 'https://proxy.corp/v1', apiKey: 'sk-clear-9999', seal: false }));
    eq(sealByokFile(home), false, 'con "seal": false explicito, tampoco');
    const j = JSON.parse(readFileSync(join(home, 'litellm.json'), 'utf8'));
    eq(j.apiKey, 'sk-clear-9999', 'la key sigue en claro en SU fichero');
    assert(!j.apiKeyEnc, 'sin blob cifrado');
    eq(byokCreds({ CONDUCTOR_HOME: home }).apiKey, 'sk-clear-9999', 'y las creds se usan con normalidad');
  } finally { rmSync(home, { recursive: true, force: true }); }
});
