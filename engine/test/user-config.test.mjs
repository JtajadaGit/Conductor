// CONFIG EN CAPAS (~/.conductor/config.json PERSONAL < openspec/conductor.json del EQUIPO) y control fino
// de modelo por FASE (models.<fase> GANA sobre el rol) — el mando de coste queda 100% en manos del dev.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDriveConfig, modelForPhase } from '../lib/pipeline/drive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

await test('config-capas: ~/.conductor/config.json aplica a todos los proyectos; el del EQUIPO gana campo a campo', () => {
  const home = join(HERE, '.tmp-user-config');
  const proj = join(HERE, '.tmp-user-config-proj');
  rmSync(home, { recursive: true, force: true }); rmSync(proj, { recursive: true, force: true });
  mkdirSync(home, { recursive: true }); mkdirSync(join(proj, 'openspec'), { recursive: true });
  const prev = process.env.CONDUCTOR_HOME;
  process.env.CONDUCTOR_HOME = home;
  try {
    writeFileSync(join(home, 'config.json'), JSON.stringify({ autoApprove: true, timeoutSeconds: 300, models: { planner: 'litellm:glm-v52', coder: 'litellm:deepseek-v4-flash' } }));
    // sin config de proyecto → mandan tus preferencias personales
    let cfg = readDriveConfig(proj);
    eq(cfg.autoApprove, true); eq(cfg.models.planner, 'litellm:glm-v52');
    // el equipo fija SOLO el coder y el timeout → tu planner personal SOBREVIVE (merge por clave)
    writeFileSync(join(proj, 'openspec', 'conductor.json'), JSON.stringify({ timeoutSeconds: 600, models: { coder: 'copilot:claude-haiku-4.5' } }));
    cfg = readDriveConfig(proj);
    eq(cfg.timeoutSeconds, 600, 'campo del equipo gana');
    eq(cfg.models.coder, 'copilot:claude-haiku-4.5', 'modelo del equipo gana en su clave');
    eq(cfg.models.planner, 'litellm:glm-v52', 'tu default personal sobrevive en las claves que el equipo no fija');
    eq(cfg.autoApprove, true, 'campo solo-personal se conserva');
  } finally {
    if (prev === undefined) delete process.env.CONDUCTOR_HOME; else process.env.CONDUCTOR_HOME = prev;
    rmSync(home, { recursive: true, force: true }); rmSync(proj, { recursive: true, force: true });
  }
});

await test('models.<fase>: la FASE gana sobre el ROL; sin fase, cae al rol; env explícito del rol manda sobre config', () => {
  const models = { planner: 'copilot:claude-haiku-4.5', explore: 'litellm:deepseek-v4-flash' };
  eq(modelForPhase('explore', 'planner', {}, models), 'litellm:deepseek-v4-flash', 'explore va al barato aunque el rol planner apunte a otro');
  eq(modelForPhase('spec', 'planner', {}, models), 'copilot:claude-haiku-4.5', 'spec (sin clave propia) hereda el rol');
  eq(modelForPhase('explore', 'planner', { CONDUCTOR_MODEL_PLANNER: 'copilot:claude-sonnet-4.5' }, models), 'litellm:deepseek-v4-flash', 'la clave de FASE sigue ganando (es lo MÁS específico)');
  eq(modelForPhase('spec', 'planner', { CONDUCTOR_MODEL_PLANNER: 'copilot:claude-sonnet-4.5' }, models), 'copilot:claude-sonnet-4.5', 'sin clave de fase, el env del rol manda sobre la config');
});
