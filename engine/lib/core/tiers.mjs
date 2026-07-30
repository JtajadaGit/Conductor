// conductor/lib/tiers.mjs — NIVELES DE COSTE por fase (economy/balanced/premium) + routing por riesgo.
// Idea de "política de modelos por tiers" de una referencia, en VERSIÓN conductor: cada tier mapea a un
// modelo concreto ("byok:qwen…" / "copilot:…") y cada fase usa un tier por defecto según su peso/riesgo
// (verify = premium; explore/tasks = economy). El modelo explícito por rol SIEMPRE gana (capas). Pilar
// coste líder + modelo por fase, sin tocar la API. Determinista. 0 dependencias.
import { priceOf } from './cost.mjs';

// clasifica un ID de modelo en economy|balanced|premium (lo consume el panel para los presets de coste).
// Verdad económica primero (tabla PRICE vía priceOf); si el id no está tabulado, heurística por nombre.
const TIER_FROM_PRICE = { haiku: 'economy', byok: 'economy', sonnet: 'balanced', opus: 'premium' };
/** @param {string} model id de modelo · @returns {'economy'|'balanced'|'premium'} (siempre uno de los tres) */
export function classifyTier(model) {
  const tier = priceOf(model).tier; // 'haiku'|'sonnet'|'opus'|'byok' o undefined si el id no está tabulado
  const known = tier ? TIER_FROM_PRICE[tier] : undefined;
  if (known) return known;
  const m = String(model || '').toLowerCase();
  if (/haiku|\bmini\b|-mini|flash|nano|lite|small|tiny|micro/.test(m)) return 'economy'; // \bmini\b: NO casar "geMINI"
  if (/opus|ultra|max|large|huge|70b|405b|pro\b/.test(m)) return 'premium';
  return 'balanced';
}
const DEFAULT_PHASE_TIER = {
  explore: 'economy', clarify: 'economy', tasks: 'economy',
  propose: 'balanced', spec: 'balanced', design: 'balanced', apply: 'balanced', fix: 'balanced',
  verify: 'premium', // la verificación es lo más sensible → tier alto por defecto
};

const TIER_ORDER = { economy: 1, balanced: 2, premium: 3 };
const maxTier = (a, b) => (TIER_ORDER[b] > (TIER_ORDER[a] || 0) ? b : a);
// keywords de riesgo → la fase sube a 'premium' (defensa ante tareas sensibles). El experto puede fijar un
// modelo explícito por rol (mayor precedencia) o desactivarlo con "riskBump": false en conductor.json.
const RISK_RE = /\b(secur|auth|passwo|credential|secret|token|crypto|encrypt|payment|\bcard\b|pii|gdpr|hipaa|complian|migrat|injection|ssrf|xss|csrf|deserial)\w*/i;

// tier por defecto de la fase + SUELO ("min_model") configurable + BUMP por riesgo. ctx={request} para el bump.
export function phaseTier(phase, cfg = {}, ctx = {}) {
  let tier = (cfg.phaseTiers && cfg.phaseTiers[phase]) || DEFAULT_PHASE_TIER[phase] || 'balanced';
  // SUELO de calidad innegociable por fase (o global con .all): nunca por debajo del floor configurado
  const floor = cfg.minTier && (cfg.minTier[phase] || cfg.minTier.all);
  if (floor && TIER_ORDER[floor]) tier = maxTier(tier, floor);
  // BUMP por riesgo: una tarea sensible sube a premium (a menos que riskBump:false)
  if (cfg.riskBump !== false && RISK_RE.test(String(ctx.request || ''))) tier = maxTier(tier, 'premium');
  return tier;
}

// modelo del tier que corresponde a la fase (o '' si no hay tiers configurados). NO incluye el modelo
// explícito por rol: eso lo resuelve el llamador con mayor precedencia (capas defaults>tier>config>env>flag).
export function tierModel(phase, cfg = {}, ctx = {}) {
  const tiers = cfg.tiers;
  if (!tiers || typeof tiers !== 'object') return { model: '', tier: null };
  const tier = phaseTier(phase, cfg, ctx);
  return { model: tiers[tier] || tiers.balanced || tiers.economy || '', tier };
}

// tier desde la CATEGORÍA DE PRECIO del picker oficial de Copilot (model_picker_price_category, catálogo
// vivo del SDK): si mañana un modelo cambia de categoría, su tier le sigue SOLO — sin tocar código. La
// heurística por nombre (classifyTier) queda de red para ids sin ficha. Pura, exportada para test.
export function tierFromPriceCategory(cat) {
  const c = String(cat || '').toLowerCase();
  return c === 'low' ? 'economy' : c === 'medium' ? 'balanced' : c === 'high' ? 'premium' : null;
}
