// conductor/lib/ci.mjs — genera el job de CI en el repo del USUARIO (no en el plugin).
// El gate se ejecuta por el COMANDO `conductor` (instalado en CI), nunca por ruta a un fichero del plugin.
// `enginePkg` = paquete instalable del motor (registro interno de la empresa). En local: ya en PATH.

export function githubWorkflow({ enginePkg = '@conductor/engine', changeGlob = 'openspec/changes/${{ github.head_ref }}' } = {}) {
  return `name: conductor-gate
on:
  pull_request:
jobs:
  gate:
    runs-on: ubuntu-latest
    permissions: { contents: read, security-events: write, pull-requests: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - name: Install conductor engine
        run: npm i -g ${enginePkg}
      - name: Deterministic SDD gate (SARIF)
        run: conductor gate ${changeGlob} --format sarif > conductor.sarif || true
      - name: Upload SARIF to code scanning
        uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: conductor.sarif }
      - name: Fail build on blocking findings
        run: conductor gate ${changeGlob}
`;
}

export function gitlabCi({ enginePkg = '@conductor/engine' } = {}) {
  return `conductor-gate:
  image: node:20
  stage: test
  before_script:
    - npm i -g ${enginePkg}
  script:
    - conductor gate openspec/changes/$CI_COMMIT_REF_SLUG --format junit > conductor-junit.xml || true
    - conductor gate openspec/changes/$CI_COMMIT_REF_SLUG
  artifacts:
    when: always
    reports:
      junit: conductor-junit.xml
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
`;
}
