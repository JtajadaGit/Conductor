// conductor/lib/confine.mjs — confinamiento de rutas (threat model T7/T8). Opt-in vía CONDUCTOR_ROOT.
// Impide que las tools/escáneres reciban rutas que escapen de una raíz declarada (path traversal,
// cross-drive). Sin raíz declarada NO confina (compatibilidad). 0 deps.
import { resolve, relative, isAbsolute } from 'node:path';

// ¿`p` queda FUERA de `root`? (sin root → nunca fuera). Cubre `..` y cambio de unidad (Windows).
export function isOutside(root, p) {
  if (!root) return false;
  const rel = relative(resolve(root), resolve(p));
  return rel.startsWith('..') || isAbsolute(rel);
}

// Lanza si algún arg-ruta conocido escapa de root. `keys` = nombres de args que son rutas.
export function assertConfined(root, args, keys) {
  if (!root || !args) return;
  for (const [k, v] of Object.entries(args)) {
    if (keys.has(k) && typeof v === 'string' && v && isOutside(root, v)) {
      throw new Error(`ruta fuera de CONDUCTOR_ROOT (${root}): ${k}=${v}`);
    }
  }
}
