import { signFile, verifyFile, generateKeypair } from '../lib/provenance.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-sign');
rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
const f = join(TMP, 'bundle.mjs');
writeFileSync(f, 'console.log("motor v1");\n');
const { privateKeyPem, publicKeyPem } = generateKeypair();

await test('signFile/verifyFile: firma válida con clave pública', () => {
  const sig = signFile(f, privateKeyPem);
  assert(verifyFile(f, sig, publicKeyPem), 'verifica con la pública correcta');
});
await test('signFile: manipular el fichero invalida la firma', () => {
  const sig = signFile(f, privateKeyPem);
  writeFileSync(f, 'console.log("motor HACKEADO");\n');
  assert(!verifyFile(f, sig, publicKeyPem), 'firma inválida tras manipular el bundle');
});
await test('signFile: otra clave pública no valida', () => {
  writeFileSync(f, 'x');
  const sig = signFile(f, privateKeyPem);
  const other = generateKeypair();
  assert(!verifyFile(f, sig, other.publicKeyPem), 'otra pública no valida');
});

rmSync(TMP, { recursive: true, force: true });
