// Tiers de coste por fase (Ola: política de modelos versión conductor).
import { tierModel, phaseTier, classifyTier } from '../lib/core/tiers.mjs';

await test('tiers: fase→tier por defecto (verify=premium, explore=economy, apply=balanced)', () => {
  eq(phaseTier('verify'), 'premium');
  eq(phaseTier('explore'), 'economy');
  eq(phaseTier('apply'), 'balanced');
});

await test('tiers: tierModel mapea por fase; sin tiers configurados = vacío', () => {
  const cfg = { tiers: { economy: 'byok:qwen', balanced: 'copilot:haiku', premium: 'copilot:sonnet' } };
  eq(tierModel('explore', cfg).model, 'byok:qwen');
  eq(tierModel('verify', cfg).model, 'copilot:sonnet');
  eq(tierModel('apply', cfg).model, 'copilot:haiku');
  eq(tierModel('apply', {}).model, '');
});

await test('tiers: phaseTiers override gana; fallback a balanced si falta el tier', () => {
  eq(tierModel('explore', { tiers: { economy: 'e', balanced: 'b' }, phaseTiers: { explore: 'balanced' } }).model, 'b');
  eq(tierModel('verify', { tiers: { economy: 'e', balanced: 'b' } }).model, 'b'); // sin premium → balanced
});

await test('tiers: classifyTier por tabla de precios (tolerante punto/guion) y heurística por nombre', () => {
  // verdad económica (PRICE vía priceOf; tolera el id con punto del catálogo real)
  eq(classifyTier('claude-haiku-4.5'), 'economy');
  eq(classifyTier('claude-sonnet-4.6'), 'balanced');
  eq(classifyTier('claude-opus-4-8'), 'premium');
  eq(classifyTier('gpt-5.5'), 'premium');
  eq(classifyTier('qwen36-msc1'), 'economy'); // byok = económico
  // heurística para ids no tabulados
  eq(classifyTier('algo-mini'), 'economy');
  eq(classifyTier('modelo-405b-ultra'), 'premium');
  eq(classifyTier('desconocido-x'), 'balanced'); // sin pistas → balanced
});

await test('tiers: min_model (suelo de calidad) sube el tier de la fase; nunca por debajo del floor', () => {
  eq(phaseTier('explore', { minTier: { explore: 'premium' } }), 'premium'); // floor por fase
  eq(phaseTier('apply', { minTier: { all: 'premium' } }), 'premium'); // floor global
  eq(phaseTier('verify', { minTier: { verify: 'economy' } }), 'premium'); // el floor NO baja (verify ya premium)
});

await test('tiers: bump por riesgo → premium ante keywords sensibles (desactivable)', () => {
  eq(phaseTier('apply', {}, { request: 'add login with password auth' }), 'premium');
  eq(phaseTier('explore', {}, { request: 'handle payment via card' }), 'premium');
  eq(phaseTier('apply', {}, { request: 'rename a button label' }), 'balanced'); // sin riesgo → tier normal
  eq(phaseTier('apply', { riskBump: false }, { request: 'security fix' }), 'balanced'); // riskBump:false lo desactiva
});
