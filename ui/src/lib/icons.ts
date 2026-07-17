// Iconos de fase y de modelo. NOTA (Windows): algunos emojis no renderizan — siempre acompañar de texto
// en los componentes para que degrade con dignidad (regla del repo: nunca el emoji como único significante).
export const PH_ICO: Record<string, string> = {
  explore: '🔍', propose: '📝', clarify: '❓', spec: '📐', design: '🧩', tasks: '🗂️', apply: '🛠️', test: '🧪', fix: '🔧', verify: '🛡️',
};

export function phaseIcon(phase: string): string {
  return PH_ICO[phase] ?? '•';
}

export function modelIcon(model: string | null | undefined, provider?: string | null): string {
  const m = (model ?? '').toLowerCase();
  if (provider === 'byok' || /qwen|deepseek|glm/.test(m)) return '🔑';
  if (/opus/.test(m)) return '🧠';
  if (/sonnet/.test(m)) return '🎼';
  if (/haiku/.test(m)) return '⚡';
  if (/gpt/.test(m)) return '🤖';
  return '💼';
}
