// PROMPTS COMO MARKDOWN (superficie de contribución): el CONTENIDO de cada fase vive en
// prompts/<fase>.md (raíz del producto) — cualquiera lo mejora con un PR sin tocar JS. El CÓDIGO sigue
// mandando la secuencia (la cura de v1 no se toca). Este guard asegura: (1) los 10 .md existen, (2) el
// motor LEE de verdad esos ficheros (paridad texto-a-texto), (3) sin ficheros hay fallback embebido.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { instructionFor, PROMPT_KEYS } from '../lib/pipeline/orchestrate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROMPTS = join(ROOT, 'prompts');
const body = (txt) => {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(txt);
  return (m ? txt.slice(m[0].length) : txt).trim();
};

await test('prompts: existe un .md por fase en prompts/ (la superficie que la gente edita)', () => {
  for (const k of PROMPT_KEYS) assert(existsSync(join(PROMPTS, `${k}.md`)), `falta prompts/${k}.md`);
});

await test('prompts: el motor LEE los .md — paridad exacta fichero↔instrucción por fase', () => {
  delete process.env.CONDUCTOR_PROMPTS_DIR;
  for (const k of PROMPT_KEYS) {
    const md = body(readFileSync(join(PROMPTS, `${k}.md`), 'utf8'));
    eq(instructionFor(k), md, `instrucción de ${k} viene del .md`);
  }
});

await test('prompts: override por CONDUCTOR_PROMPTS_DIR (un equipo puede apuntar a sus propios prompts)', () => {
  const dir = join(tmpdir(), `conductor-prompts-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(dir, 'apply.md'), '---\nphase: apply\n---\nCODER. Estilo de la casa: prueba de override.\n');
    process.env.CONDUCTOR_PROMPTS_DIR = dir;
    eq(instructionFor('apply'), 'CODER. Estilo de la casa: prueba de override.', 'lee el prompt del dir alternativo');
    assert(instructionFor('verify').includes('REVIEWER'), 'las fases sin fichero en el override caen al default embebido');
  } finally {
    delete process.env.CONDUCTOR_PROMPTS_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('prompts: sin ficheros (motor desplegado a pelo) hay fallback embebido y no vacío', () => {
  const dir = join(tmpdir(), `conductor-prompts-vacio-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  try {
    process.env.CONDUCTOR_PROMPTS_DIR = dir;
    for (const k of PROMPT_KEYS) assert((instructionFor(k) || '').length > 40, `default embebido de ${k} presente`);
  } finally {
    delete process.env.CONDUCTOR_PROMPTS_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});
