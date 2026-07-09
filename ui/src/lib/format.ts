// Formateadores puros (paridad con E/fmt/secs de la UI actual). Sin estado, sin deps.
export const escape = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

export const kebab = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

// abrevia tokens/números grandes: 1234 → 1.2k, 1_200_000 → 1.2M
export function fmt(n: number | null | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—'; // L16: Infinity/NaN/null/no-numérico → '—' (antes 'InfinityM'/'[object Object]')
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k';
  return String(v);
}

// duración legible a partir de ms
export function secs(ms: number | null | undefined): string {
  const v = Number(ms);
  if (!Number.isFinite(v) || v < 0) return '—'; // L17: no-finito o negativo (reloj adelantado) → '—'
  const s = Math.round(v / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return m + 'm' + (r ? ' ' + r + 's' : '');
  const h = Math.floor(m / 60);
  return h + 'h ' + (m % 60) + 'm';
}

// normaliza un verdict a la clase de pill del design system.
// String()-coerce DEFENSIVO: un timeline.json corrupto (el coder corre con --allow-all-tools y puede
// escribir en .conductor/, o disco/edición manual) podía traer un verdict no-string → `.toUpperCase()`
// crasheaba TODO el render del run (visto en QA). Cualquier no-string se normaliza a texto.
export function verdictClass(verdict: unknown): string {
  if (!verdict) return 'CURSO';
  const v = String(verdict).toUpperCase();
  if (v === 'GREEN') return 'GREEN';
  if (v === 'EN CURSO' || v === 'CURSO' || v === 'RUNNING' || v.includes('PAUSA')) return 'CURSO';
  if (v.startsWith('BLOCKED')) return 'BLOCKED'; // incluye BLOCKED-NEEDS-HUMAN (antes caía a neutral)
  if (['NOT-GREEN', 'ABORTED', 'STOPPED', 'INTERRUMPIDO'].includes(v)) return v;
  return 'G';
}

// VOCABULARIO HUMANO de veredictos: la pill muestra esto; el token técnico (GREEN/BLOCKED…) va al title/aria
// para el tech-lead. Un junior no debería necesitar glosario para saber si su run acabó bien.
const VERDICT_LABEL: Record<string, { label: string; hint: string }> = {
  'GREEN': { label: 'Verificado', hint: 'El gate determinista confirmó coherencia spec↔código↔tests. Listo para archivar.' },
  'NOT-GREEN': { label: 'No verificado', hint: 'El gate encontró incumplimientos tras los ciclos de corrección. Revisa el informe.' },
  'BLOCKED': { label: 'Bloqueado', hint: 'El gobierno detuvo el run. El motivo aparece bajo la cabecera.' },
  'BLOCKED-NEEDS-HUMAN': { label: 'Necesita tu decisión', hint: 'El run no converge solo: revisa el motivo y decide cómo seguir.' },
  'ABORTED': { label: 'Abortado', hint: 'Una fase no produjo su artefacto; la secuencia no se salta. Revisa el registro.' },
  'STOPPED': { label: 'Detenido', hint: 'Lo detuviste tú. Reanudar continúa donde quedó sin re-pagar fases.' },
  'INTERRUMPIDO': { label: 'Interrumpido', hint: 'El proceso se cortó. Reanudar continúa donde quedó sin re-pagar fases.' },
  'EN CURSO': { label: 'En curso', hint: 'El driver está ejecutando las fases del plan.' },
  'EN PAUSA': { label: 'Tu revisión', hint: 'El run espera tu decisión: revisa los artefactos y aprueba.' },
};
export function verdictLabel(verdict: unknown): { label: string; hint: string; token: string } {
  const token = String(verdict || 'EN CURSO').toUpperCase(); // String()-coerce: un verdict corrupto no-string no debe crashear la pill
  const e = VERDICT_LABEL[token];
  return e ? { ...e, token } : { label: verdict ? String(verdict) : 'En curso', hint: '', token };
}

// SANEO DEFENSIVO en el borde de red: /api/changes viene del server (confiable), pero un timeline.json
// corrupto (el coder escribe con --allow-all-tools) o un backend parcial puede colar tipos erróneos.
// Garantiza: projects = array de objetos, cada uno con changes = array → todo .map/.filter/.flatMap downstream
// es seguro. Evita crashes tipo "(e.changes ?? []).filter is not a function".
export function sanitizeProjects<T extends { changes?: unknown }>(projects: unknown): T[] {
  if (!Array.isArray(projects)) return [];
  return projects
    .filter((p): p is object => !!p && typeof p === 'object')
    .map((p) => ({ ...(p as object), changes: Array.isArray((p as { changes?: unknown }).changes) ? (p as { changes: unknown[] }).changes : [] })) as T[];
}
