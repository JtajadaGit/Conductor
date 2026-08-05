// Router SPA pushState propio (cero dependencia de routing). Deriva la pantalla y el apiBase desde la
// ruta — el motor sirve el MISMO index.html para todas (no hay truco __API__). Intercepta <a> internos.
export type RouteName = 'panel' | 'run' | 'demo' | 'help' | 'session' | 'flow' | 'ahorro';

export interface Route {
  name: RouteName;
  apiBase: string;
  projId?: string;
  change?: string;
  query: URLSearchParams;
}

export function parseRoute(pathname: string, search = ''): Route {
  const query = new URLSearchParams(search);
  const raw = pathname.replace(/\/+$/, '') || '/';
  // decodeURIComponent LANZA URIError ante entradas malformadas (%zz, un % suelto). parseRoute corre en el
  // inicializador de campo del Router → un throw aquí dejaba la SPA en blanco. Fallback al pathname crudo.
  let p: string;
  try { p = decodeURIComponent(raw); } catch { p = raw; }
  if (p === '/help') return { name: 'help', apiBase: '/api/', query };
  if (p === '/flow') return { name: 'flow', apiBase: '/api/', query };
  if (p === '/ahorro') return { name: 'ahorro', apiBase: '/api/', query };
  if (p === '/demo') return { name: 'demo', apiBase: '/api/demo/', query };
  if (p.startsWith('/run/') && p.length > 5) {
    const rest = p.slice(5);
    const segs = rest.split('/');
    const apiBase = `/api/run/${rest}/`;
    if (segs.length >= 2) return { name: 'run', apiBase, projId: segs[0], change: segs.slice(1).join('/'), query };
    // Solo projId sin change name → no hay run que mostrar; en vez de un redirect MUDO al dashboard global,
    // se ENFOCA ese proyecto (resolve reescribe a /?project=<id>) para no "reposicionar sin explicación" (#13).
    return { name: 'panel', apiBase: '/api/', projId: segs[0], query };
  }
  if (p.startsWith('/session/') && p.length > 9) {
    const rest = p.slice(9);
    const segs = rest.split('/');
    return { name: 'session', apiBase: `/api/run/${rest}/`, projId: segs[0], change: segs.slice(1).join('/'), query };
  }
  // RUTA DECLARATIVA DE PROYECTO: /<id-o-nombre> enfoca ese proyecto en el panel (URL navegable,
  // compartible y que sobrevive al refresh). El canónico es el id (nombre~hash6); el nombre a mano vale
  // si es único — la resolución (y el aviso honesto si no existe/ambiguo) vive en el panel, que tiene
  // la lista. Las rutas reservadas de arriba SIEMPRE ganan; /panel es alias explícito de la home.
  if (p === '/panel') return { name: 'panel', apiBase: '/api/', query };
  const seg = p.slice(1);
  if (seg && !seg.includes('/') && /^[a-z0-9-]+(~[a-f0-9]{6})?$/i.test(seg)) return { name: 'panel', apiBase: '/api/', projId: seg, query };
  return { name: 'panel', apiBase: '/api/', query };
}

export class Router extends EventTarget {
  current: Route = parseRoute(location.pathname, location.search);

  start(): void {
    window.addEventListener('popstate', () => this.resolve());
    document.addEventListener('click', (e) => this.onClick(e));
    this.resolve();
  }

  go(path: string): void {
    history.pushState({}, '', path);
    this.resolve();
  }

  private resolve(): void {
    this.current = parseRoute(location.pathname, location.search);
    // /run/<projId> SIN change (o cualquier panel con proyecto) → URL canónica declarativa /<projId>
    // (#13 evolucionado: antes se reescribía a /?project=<id>; ahora el path ES el foco).
    if (this.current.name === 'panel' && this.current.projId && location.pathname !== `/${this.current.projId}`) {
      try { history.replaceState({}, '', `/${encodeURIComponent(this.current.projId)}`); } catch { /* sin history */ }
    }
    this.dispatchEvent(new CustomEvent<Route>('change', { detail: this.current }));
  }

  private onClick(e: MouseEvent): void {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    const a = target?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    // ancla en la MISMA página (p.ej. el skip-link href="#main-content"): dejar que el navegador salte al ancla.
    // Interceptarlo hacía pushState quitando el hash → "Saltar al contenido" no hacía nada (a11y de teclado/lector).
    if (url.hash && url.pathname === location.pathname && url.search === location.search) return;
    e.preventDefault();
    this.go(url.pathname + url.search);
  }
}

export const router = new Router();
