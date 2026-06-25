// conductor/lib/pipeline/plan.mjs — RESOLVEDOR DE PLAN determinista (sin LLM, 0 tokens). Sustituye a los
// "buckets de talla" (arreglo rápido / migración) por un PLAN DE ACCIONES nombrado por lo que HACE, derivado del
// contenido de la petición. Decide (a) las FASES SDD (acciones) y (b) qué COMPROBACIONES checkeables se activan,
// CADA UNA con su PORQUÉ. El código sigue conduciendo (moat): el LLM nunca decide el plan. `verify` es terminal
// e innegociable. El experto puede refinar el plan resultante.

// señales de contenido → comprobaciones (gates). Amplias a propósito (ES+EN) para un equipo hispano.
const SIGNALS = [
  { id: 'contrato', label: 'contrato de API', re: /\bapi\b|endpoint|\brest\b|graphql|openapi|swagger|\/v\d|contrato\b/i, why: 'tu petición menciona API/endpoints' },
  { id: 'datos', label: 'seguridad de datos (migraciones/PII)', re: /\bsql\b|esquema|\bschema\b|\btabla\b|columna|\bddl\b|base de datos|\bbbdd\b|migrac|migrar/i, why: 'tu petición toca datos o esquema' },
  { id: 'tests', label: 'que las pruebas verifiquen de verdad', re: /\btests?\b|pruebas?\b|cobertura|\btdd\b/i, why: 'tu petición habla de pruebas' },
];

// fases SDD → etiqueta de ACCIÓN (lenguaje de negocio, nunca jerga ni talla)
export const PHASE_ACTION = {
  explore: 'explorar el contexto', propose: 'proponer el enfoque', clarify: 'aclarar dudas',
  spec: 'especificar los requisitos', design: 'diseñar la solución', tasks: 'desglosar en tareas',
  apply: 'implementar con pruebas', verify: 'verificar', fix: 'corregir',
};

// ¿la petición YA trae una especificación pegada? → no hace falta proponer/especificar de cero.
const looksLikeSpec = (req) => /requirement:|\bshall\b|####\s*scenario|##\s*added requirements/i.test(req);

export function resolvePlan({ request = '', hasSpec = false } = {}) {
  const req = String(request || '');
  const t = req.toLowerCase();
  const words = t.split(/\s+/).filter(Boolean).length;
  const specPasted = hasSpec || looksLikeSpec(req);
  // "sustancial" = varias capacidades / arquitectura / integración / refactor amplio (NO una talla: una señal real)
  const substantial = words > 35
    || /\bvarios?\b|m[uú]ltiples|adem[aá]s|integrac|arquitect|refactor|flujo completo|end-to-end|migrac|migrar|legacy|reescrib|portar|nuevo (servicio|m[oó]dulo|sistema)|microservici/i.test(t)
    || (t.match(/,|\sy\s/g) || []).length >= 3;
  // "ambiguo" = corto y vago, o con preguntas abiertas → conviene aclarar antes de construir
  const ambiguous = !specPasted && (words < 4 || /\?|no s[eé]\b|quiz[aá]|tal vez|alguna forma/i.test(t));

  // FASES (orden canónico). verify SIEMPRE al final (gobierno innegociable).
  const phases = [];
  if (!specPasted && substantial) phases.push('explore');
  if (!specPasted) phases.push('propose');
  if (ambiguous) phases.push('clarify');
  if (!specPasted) phases.push('spec');
  if (substantial) phases.push('design', 'tasks');
  phases.push('apply', 'verify');

  // COMPROBACIONES: siempre las deterministas base + las que enciende el contenido (con su porqué).
  const checks = [
    { id: 'coherencia', label: 'coherencia spec↔tareas↔resultado', always: true },
    { id: 'trazabilidad', label: 'trazabilidad requisito→código→test', always: true },
    { id: 'secretos', label: 'sin secretos ni datos sensibles en el código', always: true },
  ];
  for (const s of SIGNALS) if (s.re.test(t)) checks.push({ id: s.id, label: s.label, why: s.why });

  // complejidad INTERNA (la maquinaria del motor ya sabe ejecutarla) — NUNCA se muestra como etiqueta al usuario;
  // la UI enseña ACCIONES + comprobaciones. Sustancial → medium (o complex si además es ambiguo); resto → simple
  // (mínimo gobernado, con verify). Así el plan MOSTRADO coincide con el que se EJECUTA.
  const complexity = substantial ? (ambiguous ? 'complex' : 'medium') : 'simple';

  return {
    complexity,
    phases,
    actions: phases.map((p) => PHASE_ACTION[p] || p),
    checks,
    specPasted,
    substantial,
    summary: phases.map((p) => PHASE_ACTION[p] || p).join(' → '),
  };
}
