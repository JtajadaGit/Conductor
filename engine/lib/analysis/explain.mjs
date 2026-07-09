// conductor/lib/explain.mjs — ingeniería inversa: código (legacy) → borrador de spec OpenSpec.
// Determinista, multi-stack (JS/TS, Java, PHP, Python). Extrae endpoints HTTP, clases/servicios y
// genera spec.md (delta) + tasks.md + un OpenAPI esqueleto. El borrador se entrega a la fase de
// planificación (LLM) para refinarlo: determinista para la estructura, IA para el matiz. Ingeniería
// inversa generalizada a cualquier stack.
import { readFileSync, readdirSync, statSync, lstatSync } from 'node:fs';
import { join, relative, basename, extname } from 'node:path';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.next', 'coverage', 'vendor']);
const slug = (s) => 'REQ-' + s.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// patrones de endpoints HTTP por framework
const ROUTE_PATTERNS = [
  // Express / Fastify / Koa router: app.get('/x'  router.post("/y"
  { re: /\b(?:app|router|server)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi, m: 1, p: 2 },
  // NestJS / TS decorators: @Get('/x') — comillas OBLIGATORIAS y EMPAREJADAS (backreference \2) + cota {0,512}
  // → mata el ReDoS (la versión con comillas opcionales + [^...]* hacía O(n²) y colgaba con ficheros grandes).
  { re: /@(Get|Post|Put|Delete|Patch)\s*\(\s*(['"`])([^'"`)]{0,512})\2\s*\)/g, m: 1, p: 3 },
  // @Get() sin ruta (la ruta la da el controller) — caso vacío separado, sin cuantificador peligroso
  { re: /@(Get|Post|Put|Delete|Patch)\s*\(\s*\)/g, m: 1, p: 2 },
  // Spring: @GetMapping("/x") @RequestMapping(value="/y", method=...)
  { re: /@(Get|Post|Put|Delete|Patch)Mapping\s*\(\s*(?:value\s*=\s*)?['"]([^'"]*)['"]/g, m: 1, p: 2 },
  // Flask/FastAPI: @app.route('/x', methods=['POST'])  @router.get('/y')
  { re: /@(?:app|router|blueprint)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi, m: 1, p: 2 },
  // PHP Laravel: Route::get('/x', ...)  Symfony #[Route('/y', methods:['GET'])]
  { re: /Route::(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi, m: 1, p: 2 },
  // Go (gin/chi/echo): r.GET("/x", ...)  e.POST("/y")  router.Handle
  { re: /\b\w+\.(GET|POST|PUT|DELETE|PATCH)\s*\(\s*"([^"]+)"/g, m: 1, p: 2 },
  // C# attributes: [HttpGet("/x")]  [HttpPost]
  { re: /\[Http(Get|Post|Put|Delete|Patch)\s*\(\s*"([^"]*)"\s*\)\]/g, m: 1, p: 2 },
  // Ruby (Sinatra/Rails routes): get '/x' do   post "/y"
  { re: /^\s*(get|post|put|delete|patch)\s+['"]([^'"]+)['"]/gim, m: 1, p: 2 },
];
// unidades de código (clase/servicio/controller/función exportada)
const UNIT_PATTERNS = [
  /\bexport\s+(?:default\s+)?class\s+(\w+)/g,
  /\bpublic\s+class\s+(\w+)/g,
  /\bexport\s+(?:async\s+)?function\s+(\w+)/g,
  /\b(?:def)\s+(\w+)\s*\(?/g,        // python / ruby
  /\btype\s+(\w+)\s+struct\b/g,      // go
  /\bfunc\s+(?:\([^)]*\)\s*)?(\w+)\s*\(/g, // go funcs/methods
  /\bclass\s+(\w+)/g,                 // ruby / generic
];

const MAX_FILES = 20000; // cota anti-DoS
function walk(dir, acc = []) {
  if (acc.length >= MAX_FILES) return acc;
  let entries; try { entries = readdirSync(dir); } catch { return acc; }
  for (const name of entries) {
    if (SKIP.has(name) || acc.length >= MAX_FILES) continue;
    const full = join(dir, name); let st; try { st = lstatSync(full); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(full, acc);
    else if (st.isFile() && /\.(ts|js|tsx|jsx|java|php|py|cls|go|cs|rb)$/.test(name) && st.size < 512 * 1024) acc.push(full);
  }
  return acc;
}
const capabilityOf = (relPath) => {
  // capacidad = primer segmento significativo del path (src/<cap>/...) o el nombre del fichero
  const parts = relPath.split('/').filter((p) => p && !['src', 'app', 'lib', 'main', 'java', 'com'].includes(p.toLowerCase()));
  return (parts[0] || basename(relPath, extname(relPath))).replace(/\.(controller|service|component|trigger|plugin|test|spec)$/i, '');
};

export function explain(srcDir) {
  const caps = new Map(); // name -> { name, id, endpoints:Set, units:Set, files:Set }
  const getCap = (name) => { const k = name; if (!caps.has(k)) caps.set(k, { name, id: slug(name), endpoints: new Map(), units: new Set(), files: new Set() }); return caps.get(k); };

  for (const file of walk(srcDir)) {
    let txt; try { txt = readFileSync(file, 'utf8'); } catch { continue; }
    const rel = relative(srcDir, file).replace(/\\/g, '/');
    if (/(^|[/._-])(test|spec)[._-]/i.test(rel) || /[A-Za-z0-9]Test\.[a-z]+$/.test(rel)) continue; // ignora tests al extraer (no 'latest.js')
    const cap = getCap(capabilityOf(rel));
    cap.files.add(rel);
    for (const { re, m, p } of ROUTE_PATTERNS) {
      re.lastIndex = 0; let mm;
      while ((mm = re.exec(txt))) { const method = mm[m].toUpperCase(); const path = mm[p] || '/'; cap.endpoints.set(`${method} ${path}`, { method, path }); }
    }
    for (const re of UNIT_PATTERNS) { re.lastIndex = 0; let mm; while ((mm = re.exec(txt))) if (mm[1] && mm[1].length > 2) cap.units.add(mm[1]); }
  }

  const capabilities = [...caps.values()].filter((c) => c.endpoints.size || c.units.size).map((c) => ({
    id: c.id, name: c.name, endpoints: [...c.endpoints.values()], units: [...c.units].slice(0, 12), files: [...c.files],
  })).sort((a, b) => (b.endpoints.length + b.units.length) - (a.endpoints.length + a.units.length));

  return { capabilities, openapi: toOpenApi(capabilities) };
}

function toOpenApi(capabilities) {
  const paths = {};
  for (const c of capabilities) for (const e of c.endpoints) {
    paths[e.path] ||= {};
    paths[e.path][e.method.toLowerCase()] = { summary: `${c.name} ${e.method}`, responses: { '200': { description: 'ok' } } };
  }
  return Object.keys(paths).length ? { openapi: '3.0.3', info: { title: 'extracted', version: '0.0.0' }, paths } : null;
}

export function renderSpec(capabilities) {
  let out = '## ADDED Requirements\n';
  for (const c of capabilities) {
    out += `\n<!-- id: ${c.id} -->\n### Requirement: ${c.name}\nThe system SHALL provide the ${c.name} capability (reverse-engineered draft — refine).\n`;
    const scenarios = c.endpoints.length ? c.endpoints : c.units.slice(0, 5).map((u) => ({ method: '', path: u }));
    for (const s of scenarios) {
      const label = s.method ? `${s.method} ${s.path}` : s.path;
      out += `\n#### Scenario: ${label}\n- **GIVEN** a valid request\n- **WHEN** ${label} is invoked\n- **THEN** it behaves as the existing implementation (TODO: confirm)\n`;
    }
  }
  return out;
}

export function renderTasks(capabilities) {
  let out = '# Tasks (reverse-engineered draft)\n\n';
  let n = 1;
  for (const c of capabilities) { out += `- [ ] ${n}.1 [${c.id}] Confirm & document ${c.name} (${c.files.length} file(s), ${c.endpoints.length} endpoint(s))\n`; n++; }
  return out;
}
