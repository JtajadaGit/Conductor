// conductor/lib/contract/legacy.mjs — BASE de migración legacy CONDUCIDA POR CÓDIGO (determinista, 0 LLM, 0 red).
// El diferenciador vs los rivales: su migración es prompt-driven (un modelo flojo se la salta). Aquí la EVIDENCIA
// se calcula en CÓDIGO y un evidence-gate determinista BLOQUEA la generación de spec/implementación hasta que cada
// feature declarada está respaldada por evidencia en el sistema viejo. Invariante: "declarada ≠ lista" — declarar
// una feature no otorga readiness; solo la otorga la evidencia trazada.
//
// ALCANCE (base limpia, aditiva — NO cableada al veredicto del run todavía):
//  · extractAnchors(): extractor GENÉRICO de "anclas" (señales de capacidad) por regex, agnóstico de lenguaje.
//  · traceFeature(): puntúa una feature declarada contra las anclas → evidencia + confianza + estado.
//  · assessReadiness(): gate determinista de readiness sobre todas las features (con blockers explícitos).
// DECISIÓN QUE NECESITA JORGE (marcada): los ADAPTADORES por stack concreto (PowerBuilder/Oracle/SAP/Magento/…)
// que produzcan anclas de alta fidelidad son trabajo siguiente; aquí el extractor genérico cubre patrones comunes
// (SQL, símbolos de código, rutas HTTP, formularios UI) suficiente para la base y los tests.

// vocabulario de capacidades TECNOLOGÍA-AGNÓSTICO (qué hace el código viejo, no en qué está escrito)
export const CAPABILITIES = ['ui_surface', 'user_action', 'function', 'data_access', 'data_model', 'business_rule', 'integration_point', 'report'];

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'que', 'los', 'las', 'del', 'una', 'por', 'con', 'get', 'set', 'tmp', 'var', 'val', 'foo', 'bar', 'util', 'utils', 'common', 'helper', 'base', 'main', 'index', 'test']);
const tokens = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w));

// señales genéricas → capacidad. Cada patrón captura un "símbolo" representativo. Amplio a propósito.
const ANCHOR_RULES = [
  { cap: 'data_model', re: /\bcreate\s+table\s+[`"\[]?(\w+)/gi },
  { cap: 'data_access', re: /\b(?:select|insert|delete)\b[\s\S]{0,60}?\b(?:from|into)\s+[`"\[]?(\w+)/gi },
  { cap: 'data_access', re: /\bupdate\s+[`"\[]?(\w+)[`"\]]?\s+set\b/gi },
  { cap: 'integration_point', re: /\b(?:https?:\/\/|wsdl|soap|endpoint|fetch|axios|resttemplate|httpclient)\b[\s\S]{0,40}?[`'"\/]?(\w{3,})/gi },
  { cap: 'user_action', re: /\b(?:(on[A-Z]\w+)|addEventListener\(\s*['"]?(\w+)|@?(?:RequestMapping|GetMapping|PostMapping|route)\b[\s\S]{0,40}?[`'"\/]?(\w{3,}))/g },
  { cap: 'ui_surface', re: /<(?:form|button|input|table|select|view|window|w_\w+)\b[^>]*?(?:name|id)?=?["']?(\w{3,})?/gi },
  { cap: 'report', re: /\b(?:report|jasper|jrxml|crystal|\.rdl|invoice|listado|informe)\w*\s*[:=]?\s*[`'"]?(\w{3,})?/gi },
  { cap: 'business_rule', re: /\bif\b[\s\S]{0,80}?\b(?:then|\{|:)\s*(?:\/\/|#|--)?\s*(\w{4,})?/gi },
  { cap: 'function', re: /\b(?:function|def|public|private|protected|func|sub|fn)\s+(\w{3,})\s*\(/gi },
];

// extrae anclas (señales de capacidad) de un fichero. GENÉRICO: no parsea AST, reconoce patrones comunes.
export function extractAnchors(path, text) {
  const src = String(text == null ? '' : text);
  const out = [];
  for (const { cap, re } of ANCHOR_RULES) {
    re.lastIndex = 0;
    let m, guard = 0;
    while ((m = re.exec(src)) && guard++ < 2000) {
      const symbol = (m.slice(1).find(Boolean) || '').trim();
      if (!symbol || symbol.length < 3) continue;
      out.push({ capability: cap, symbol: symbol.toLowerCase(), file: String(path), signals: tokens(symbol) });
    }
  }
  // dedup por (capability, symbol, file)
  const seen = new Set();
  return out.filter((a) => { const k = `${a.capability}|${a.symbol}|${a.file}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// puntúa una feature declarada {name, keywords?} contra las anclas extraídas → evidencia + confianza + estado.
// confianza: high (≥2 anclas específicas casan) · medium (1) · low (solo coincidencia genérica) · none.
export function traceFeature(feature, anchors) {
  const fTokens = new Set([...tokens(feature.name), ...(feature.keywords || []).flatMap((k) => tokens(k))]);
  const evidence = [];
  for (const a of anchors) {
    const overlap = a.signals.filter((s) => fTokens.has(s));
    if (overlap.length) evidence.push({ capability: a.capability, symbol: a.symbol, file: a.file, matched: overlap, specific: overlap.length >= 2 || a.symbol.length >= 6 });
  }
  const specific = evidence.filter((e) => e.specific).length;
  const confidence = specific >= 2 ? 'high' : specific === 1 ? 'medium' : evidence.length ? 'low' : 'none';
  const caps = new Set(evidence.map((e) => e.capability));
  const gaps = [];
  if (!evidence.length) gaps.push('CODE_TRACE_REQUIRED');
  if (!caps.has('data_model') && !caps.has('data_access') && /dato|tabla|persist|model|bbdd|db\b/i.test(feature.name)) gaps.push('DATA_MODEL_REQUIRED');
  if (!caps.has('integration_point') && /integrac|api|servicio|external|soap|rest/i.test(feature.name)) gaps.push('EXTERNAL_CONTRACT_REQUIRED');
  const status = confidence === 'high' ? 'resolved' : confidence === 'none' ? 'unresolved' : 'partial';
  return { feature: feature.name, confidence, status, evidence, gaps };
}

// GATE DE READINESS determinista sobre todas las features. "declarada ≠ lista": la implementación queda BLOQUEADA
// hasta que toda feature esté al menos parcialmente fundamentada y sin blockers duros.
export function assessReadiness(features = [], sources = []) {
  const anchors = sources.flatMap((s) => extractAnchors(s.path, s.text));
  const traced = features.map((f) => traceFeature(f, anchors));
  const unresolved = traced.filter((t) => t.status === 'unresolved');
  const hardBlockers = [...new Set(traced.flatMap((t) => t.gaps))];
  let state, allowed;
  if (!features.length || unresolved.length) {
    // sin features, o alguna sin NINGUNA evidencia → no se puede generar spec fiable ni implementar
    state = 'BLOCKED'; allowed = { generateSpec: false, implement: false };
  } else if (hardBlockers.length || traced.some((t) => t.status === 'partial')) {
    // evidencia parcial O un bloqueador duro (p.ej. DATA_MODEL/EXTERNAL_CONTRACT_REQUIRED en una feature por lo
    // demás "resolved") → se puede especificar, pero la implementación queda BLOQUEADA (no se da por lista).
    state = 'NEEDS_DEEPENING'; allowed = { generateSpec: true, implement: false };
  } else {
    state = 'READY_FOR_SPEC'; allowed = { generateSpec: true, implement: true };
  }
  return { features: traced, blockers: hardBlockers, unresolvedCount: unresolved.length, state, allowed, anchorsFound: anchors.length };
}
