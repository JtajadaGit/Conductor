// FAILOVER de modelo OPT-IN (T2 del barrido 2026-07-29): tras agotar maxRetries con fallo NO atribuible
// al contenido (timeout/provider/crash/no-progress), UN único intento extra con el modelo de reserva de
// cfg.fallback (rol o fase; la fase gana). OFF por defecto = cero cambio de comportamiento.
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drive } from '../lib/pipeline/drive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const NL = '\n';

// agente que FALLA (timeout fake) siempre que le pidan el modelo primario y CUMPLE con el de reserva
function flakyByModel({ failModel, slug }) {
  const agent = ({ phase, writeTo, cwd, model, prompt }) => {
    agent.calls.push({ phase, model: model || null });
    void prompt;
    if ((phase === 'apply' || phase === 'fix') && (model || null) === failModel) {
      return Promise.resolve({ code: -1, err: 'timeout: primary model down (fake)' });
    }
    if (phase === 'apply' || phase === 'fix') {
      mkdirSync(join(cwd, 'src'), { recursive: true });
      const tag = `// @conductor REQ-${slug}${NL}`;
      writeFileSync(join(cwd, 'src', `${slug}.js`), `${tag}export const ${slug} = (n) => n + 1;${NL}`);
      writeFileSync(join(cwd, 'src', `${slug}.test.js`), `${tag}import { ${slug} } from './${slug}.js';${NL}if (${slug}(1) !== 2) throw new Error('fail');${NL}`);
      return Promise.resolve({ code: 0 });
    }
    if (writeTo) {
      mkdirSync(dirname(writeTo), { recursive: true });
      const base = String(writeTo).replace(/\\/g, '/').split('/').pop();
      let c = 'artifact content';
      if (/spec\.md$/.test(base)) c = ['## ADDED Requirements', `<!-- id: REQ-${slug} -->`, `### Requirement: ${slug}`, `The system SHALL ${slug}.`, '#### Scenario: works', '- **GIVEN** a', '- **WHEN** b', '- **THEN** c'].join(NL);
      else if (base === 'tasks.md') c = `- [ ] 1.1 [REQ-${slug}] implement`;
      else if (/verify-report\.md$/.test(base)) c = `## Verdict${NL}PASS${NL}## Per scenario${NL}✅ works — src/${slug}.js:1`;
      else if (base === 'proposal.md') c = `## Why${NL}x${NL}## What Changes${NL}- y${NL}## Impact${NL}z`;
      writeFileSync(writeTo, c);
    }
    return Promise.resolve({ code: 0 });
  };
  agent.calls = [];
  return agent;
}

async function run({ slug, cfg, models, agent }) {
  const T = join(HERE, `.tmp-fallback-${slug}`);
  rmSync(T, { recursive: true, force: true });
  mkdirSync(join(T, 'openspec'), { recursive: true });
  writeFileSync(join(T, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 1, lenses: false, serve: false, ...(models ? { models } : {}), ...cfg }));
  const prev = process.env.CONDUCTOR_CAPTURE; process.env.CONDUCTOR_CAPTURE = 'fs';
  try {
    const r = await drive({ changeDir: join(T, 'openspec', 'changes', slug), request: `add ${slug}`, complexity: 'simple', domain: 'core', srcDir: T, runAgent: agent });
    const tl = JSON.parse(readFileSync(join(T, 'openspec', 'changes', slug, '.conductor', 'timeline.json'), 'utf8'));
    return { r, tl, T };
  } finally {
    if (prev === undefined) delete process.env.CONDUCTOR_CAPTURE; else process.env.CONDUCTOR_CAPTURE = prev;
    rmSync(T, { recursive: true, force: true });
  }
}

await test('fallback: SIN la clave, comportamiento intacto — el primario roto agota intentos y NO llega a GREEN', async () => {
  const agent = flakyByModel({ failModel: 'copilot:roto', slug: 'nofb' });
  const { r } = await run({ slug: 'nofb', cfg: {}, models: { coder: 'copilot:roto' }, agent });
  assert(r.verdict !== 'GREEN', `sin fallback debe fallar (verdict ${r.verdict})`);
  const applyCalls = agent.calls.filter((c) => c.phase === 'apply');
  eq(applyCalls.length, 2, 'maxRetries=1 → exactamente 2 intentos, ninguno extra');
});

await test('fallback: OPT-IN por fase/rol — intento extra con la reserva → GREEN + timeline honesto', async () => {
  const agent = flakyByModel({ failModel: 'copilot:roto', slug: 'sifb' });
  const { r, tl } = await run({ slug: 'sifb', cfg: { fallback: { coder: 'copilot:reserva' } }, models: { coder: 'copilot:roto' }, agent });
  eq(r.verdict, 'GREEN', 'la reserva salva el run');
  const ap = tl.phases.find((p) => p.phase === 'apply');
  assert(ap.fallback && ap.fallback.to === 'reserva' && ap.fallback.from === 'roto', 'timeline.fallback {from,to} presente');
  assert(['timeout', 'provider', 'crash', 'no-progress', 'unknown'].includes(ap.fallback.afterKind), 'motivo del failover registrado');
  eq(ap.attempts, 3, 'maxRetries(1)+1 primarios + 1 de reserva = 3');
  eq(ap.modelRequested, 'roto', 'modelRequested conserva el PRIMARIO (honestidad)');
  eq(ap.model, 'reserva', 'model refleja el usado de verdad');
  assert(tl.fallbackUsed === true, 'flag top-level para stats/AI Act');
  const applyModels = agent.calls.filter((c) => c.phase === 'apply').map((c) => c.model);
  eq(applyModels, ['copilot:roto', 'copilot:roto', 'copilot:reserva'], 'la reserva entra UNA vez y al final (el agente recibe el spec completo)');
});

await test('fallback: la policy manda — reserva fuera de allowedModels => failover omitido y fallo honesto', async () => {
  const agent = flakyByModel({ failModel: 'copilot:roto', slug: 'polfb' });
  const T = join(HERE, '.tmp-fallback-polfb');
  rmSync(T, { recursive: true, force: true });
  mkdirSync(join(T, 'openspec'), { recursive: true });
  writeFileSync(join(T, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false, serve: false, models: { coder: 'copilot:roto' }, fallback: { coder: 'copilot:prohibido' } }));
  // policy VÁLIDA (el schema exige version+blockSeverity; una inválida se descarta fail-open y no vetaría)
  writeFileSync(join(T, 'openspec', 'policy.json'), JSON.stringify({ version: 1, blockSeverity: 'error', mandatoryGates: ['coherence', 'artifacts'], allowedModels: ['roto'] }));
  const prev = process.env.CONDUCTOR_CAPTURE; process.env.CONDUCTOR_CAPTURE = 'fs';
  try {
    const r = await drive({ changeDir: join(T, 'openspec', 'changes', 'polfb'), request: 'add polfb', complexity: 'simple', domain: 'core', srcDir: T, runAgent: agent });
    assert(r.verdict !== 'GREEN', 'reserva vetada por policy => el run falla como sin fallback');
    const applyModels = agent.calls.filter((c) => c.phase === 'apply').map((c) => c.model);
    eq(applyModels, ['copilot:roto'], 'CERO llamadas con el modelo vetado');
  } finally {
    if (prev === undefined) delete process.env.CONDUCTOR_CAPTURE; else process.env.CONDUCTOR_CAPTURE = prev;
    rmSync(T, { recursive: true, force: true });
  }
});
