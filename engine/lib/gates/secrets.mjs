// conductor/lib/gates/secrets.mjs — escáner DETERMINISTA de secretos/PII sobre los ficheros que el agente
// ESCRIBIÓ (R-G2). Hasta ahora el scrub solo protegía la TELEMETRÍA; un secreto hardcodeado EN EL CÓDIGO
// pasaba el gate. Crítico para Salesforce/SAP/Magento. Patrones de ALTA PRECISIÓN (allowlist de formas
// conocidas, no heurística laxa) → bajo falso-positivo; coste 0 tokens (no llama a ningún modelo).
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX_BYTES = 512 * 1024; // ficheros enormes/binarios fuera (un bundle minificado no es código a revisar)

// formas de secreto reconocibles SIN ambigüedad (cada una bloquea: severity error)
const TOKEN_PATTERNS = [
  ['aws-access-key-id', /\bAKIA[0-9A-Z]{16}\b/],
  ['gcp-api-key', /\bAIza[0-9A-Za-z_\-]{35}\b/],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['slack-token', /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/],
  ['openai-style-key', /\bsk-[A-Za-z0-9]{20,}\b/],
  ['private-key-block', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
  ['db-connection-credentials', /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|mariadb|redis|amqp):\/\/[^\s:/@]+:[^\s:/@]{3,}@/i],
  ['bearer-token', /\bBearer\s+[A-Za-z0-9._\-]{20,}/],
];

// asignación hardcodeada de credencial: api_key/secret/password/token = "valor". Filtro de placeholders
// para no marcar ejemplos (your_key, <token>, ${VAR}, process.env.X, changeme, etc.).
const ASSIGN_RE = /\b(api[_-]?key|secret|password|passwd|access[_-]?token|client[_-]?secret|auth[_-]?token)\b\s*[:=]\s*['"]([^'"\n]{8,})['"]/gi;
const PLACEHOLDER_RE = /^(?:x{3,}|your[_-]?|<|\$\{|process\.env|import\.meta\.env|os\.environ|example|changeme|placeholder|dummy|redacted|none|null|undefined|true|false|sample|test[_-]?|fake|xxx)/i;

// PII: número de tarjeta válido por Luhn con IIN plausible (Visa/MC/Amex/Discover). El IIN evita marcar
// cualquier ristra de 16 dígitos que pase Luhn por azar (~10%).
function luhnValid(num) {
  let sum = 0, alt = false;
  for (let i = num.length - 1; i >= 0; i--) { let d = +num[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } sum += d; alt = !alt; }
  return sum % 10 === 0;
}
const CARD_RE = /\b(?:4\d{12}(?:\d{3})?|(?:5[1-5]\d{2}|2(?:2[2-9]\d|[3-6]\d{2}|7[01]\d|720))\d{12}|3[47]\d{13}|6(?:011|5\d{2})\d{12})\b/g;

function scanText(text) {
  const lines = text.split('\n');
  const found = [];
  const add = (rule, message, lineIdx) => found.push({ rule: `secrets.${rule}`, severity: 'error', message, line: lineIdx + 1 });
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const [rule, re] of TOKEN_PATTERNS) if (re.test(line)) add(rule, `posible secreto (${rule}) hardcodeado`, i);
    ASSIGN_RE.lastIndex = 0;
    let m;
    while ((m = ASSIGN_RE.exec(line))) { const val = m[2]; if (!PLACEHOLDER_RE.test(val.trim())) add('hardcoded-credential', `credencial hardcodeada en asignación a "${m[1]}"`, i); }
    CARD_RE.lastIndex = 0;
    let c;
    while ((c = CARD_RE.exec(line))) { const digits = c[0].replace(/\D/g, ''); if (luhnValid(digits)) add('pii-card-number', 'posible número de tarjeta (PII) válido por Luhn', i); }
  }
  return found;
}

// rootDir + rutas relativas (las que capturó el driver). Lee, salta binarios/enormes/ilegibles, escanea.
// Devuelve findings [{rule, severity:'error', message, file, line}]. Tope de findings para no inundar.
export function scanSecrets(rootDir, relFiles, { maxFindings = 100 } = {}) {
  const findings = [];
  for (const rel of relFiles || []) {
    if (!rel) continue;
    const abs = join(rootDir, rel);
    let text;
    try { if (statSync(abs).size > MAX_BYTES) continue; text = readFileSync(abs, 'utf8'); } catch { continue; }
    if (text.includes('\0')) continue; // binario
    for (const f of scanText(text)) { findings.push({ ...f, file: rel }); if (findings.length >= maxFindings) return findings; }
  }
  return findings;
}
