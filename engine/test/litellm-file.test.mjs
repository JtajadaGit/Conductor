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
