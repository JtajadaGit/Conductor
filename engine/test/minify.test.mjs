// minify.test.mjs — minificador de contexto token-first (lossless en texto/markdown; opt-in para código).
import { minifyText, minifyCode, minifySaved } from '../lib/core/minify.mjs';

await test('minifyText: colapsa blancos, recorta espacios finales, sin perder contenido (lossless)', () => {
  const dirty = 'a  \n\n\n\nb\t\n   \n\nc\n\n\n';
  eq(minifyText(dirty), 'a\n\nb\n\nc', 'líneas de contenido preservadas; nunca 3+ blancos; sin trailing ws');
  // idempotente: minificar lo ya minificado no cambia nada
  eq(minifyText(minifyText(dirty)), minifyText(dirty), 'idempotente');
  // no toca contenido real (palabras intactas)
  assert(/a/.test(minifyText(dirty)) && /b/.test(minifyText(dirty)) && /c/.test(minifyText(dirty)));
});

await test('minifyCode: quita comentarios // y # pero respeta :// de URLs', () => {
  const m = minifyCode('const x = 1; // comentario\nfetch("http://ejemplo/x");\n# comentario py\ncode();');
  assert(/http:\/\/ejemplo\/x/.test(m), 'la URL con :// se conserva (no se trata como comentario)');
  assert(!/comentario/.test(m), 'comentarios // y # eliminados');
  assert(/code\(\)/.test(m) && /const x = 1/.test(m), 'el código real se conserva');
});

await test('minifySaved: tokens ahorrados (aprox chars/4), nunca negativo', () => {
  const orig = 'xxxxxxxx\n\n\n\n\n\n\n\n'; // 8 chars + mucho blanco
  const min = minifyText(orig);
  assert(minifySaved(orig, min) >= 1, 'minificar blanco ahorra ≥1 token');
  eq(minifySaved('abc', 'abcdefghij'), 0, 'si el minificado fuese mayor → 0 (nunca negativo)');
});
