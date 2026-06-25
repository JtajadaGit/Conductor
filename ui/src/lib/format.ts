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

// normaliza un verdict a la clase de pill del design system
export function verdictClass(verdict: string | null | undefined): string {
  if (!verdict) return 'CURSO';
  const v = verdict.toUpperCase();
  if (v === 'GREEN') return 'GREEN';
  if (v === 'EN CURSO' || v === 'CURSO' || v === 'RUNNING' || v.includes('PAUSA')) return 'CURSO';
  if (['NOT-GREEN', 'ABORTED', 'STOPPED', 'INTERRUMPIDO', 'BLOCKED'].includes(v)) return v;
  return 'G';
}
