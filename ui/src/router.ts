// Router SPA pushState propio (cero dependencia de routing). Deriva la pantalla y el apiBase desde la
// ruta — el motor sirve el MISMO index.html para todas (no hay truco __API__). Intercepta <a> internos.
export type RouteName = 'panel' | 'run' | 'demo' | 'help' | 'session' | 'flow';

export interface Route {
  name: RouteName;
  apiBase: string;
  projId?: string;
  change?: string;
  query: URLSearchParams;
}

export function parseRoute(pathname: string, search = ''): Route {
  const query = new URLSearchParams(search);
  const p = decodeURIComponent(pathname.replace(/\/+$/, '') || '/');
  if (p === '/help') return { name: 'help', apiBase: '/api/', query };
  if (p === '/flow') return { name: 'flow', apiBase: '/api/', query };
  if (p === '/demo') return { name: 'demo', apiBase: '/api/demo/', query };
  if (p.startsWith('/run/') && p.length > 5) {
    const rest = p.slice(5);
    const segs = rest.split('/');
    const apiBase = `/api/run/${rest}/`;
    if (segs.length >= 2) return { name: 'run', apiBase, projId: segs[0], change: segs.slice(1).join('/'), query };
    // Solo projId sin change name → no hay run que mostrar; volver al panel (B2)
    return { name: 'panel', apiBase: '/api/', query };
  }
  if (p.startsWith('/session/') && p.length > 9) {
    const rest = p.slice(9);
    const segs = rest.split('/');
    return { name: 'session', apiBase: `/api/run/${rest}/`, projId: segs[0], change: segs.slice(1).join('/'), query };
  }
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
    this.dispatchEvent(new CustomEvent<Route>('change', { detail: this.current }));
  }

  private onClick(e: MouseEvent): void {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    const a = target?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    this.go(url.pathname + url.search);
  }
}

export const router = new Router();
