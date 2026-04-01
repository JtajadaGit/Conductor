# 🧪 Modo TDD Estricto

[← Volver al README](../README.md) | [Ver Catálogo de Skills](./04-catalogo-skills.md)

## ¿Qué es el Modo TDD Estricto?

El Modo TDD Estricto es un protocolo que transforma cómo `sdd-apply` escribe código y cómo `sdd-verify` lo valida. Cuando está activo, **todo código de producción nace de un test que lo exige**.

> **TDD no es testear después de escribir código.** TDD es **diseño de software dirigido por tests**. Escribís un test que describe lo que el código DEBERÍA hacer, y después escribís el mínimo código para hacerlo realidad. Los tests diseñan la API, los contratos, el comportamiento. El código es un efecto secundario de los tests.

**Diferencia clave:**

| Sin TDD | Con TDD Estricto |
|---------|-------------------|
| Escribir código → escribir tests | Escribir test → escribir código → refactorizar |
| Tests verifican que funciona | Tests **diseñan** cómo funciona |
| Cobertura variable | Cobertura alta por construcción |

---

## Las Tres Leyes del TDD

1. **No escribir código de producción** hasta tener un test que falla
2. **No escribir más test** del necesario para que falle
3. **No escribir más código** del necesario para que el test pase

Estas tres leyes son inviolables. Cada una protege contra un anti-patrón:

| Ley | Protege contra |
|-----|----------------|
| 1ª | Código sin especificación (no se sabe qué debería hacer) |
| 2ª | Tests sobredimensionados que son frágiles y difíciles de mantener |
| 3ª | Código especulativo que agrega complejidad innecesaria |

---

## Activación

El Modo TDD Estricto se resuelve automáticamente con una cadena de prioridad — el primero que matchea gana:

### 1. Configuración del agente (máxima prioridad)

Buscar el marcador `strict-tdd-mode` en los archivos de configuración del agente (`CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `copilot-instructions.md`):

```yaml
strict-tdd-mode: enabled   # → strict_tdd: true
strict-tdd-mode: disabled  # → strict_tdd: false
```

### 2. Config de openspec

Si no hay marcador del agente, leer `openspec/config.yaml`:

```yaml
strict_tdd: true   # Activado explícitamente
strict_tdd: false  # Desactivado explícitamente
```

### 3. Auto-detección (por defecto)

Si no se encontró ninguna configuración:

```
Test runner detectado  → strict_tdd: true  (si el proyecto PUEDE hacer TDD, hacemos TDD)
Sin test runner        → strict_tdd: false (imposible sin runner)
```

> **No se pregunta al usuario interactivamente.** La preferencia se resuelve de config existente. Para cambiarla, el usuario modifica `strict_tdd` en `openspec/config.yaml`.

---

## Carga Condicional — Zero Token Cost

El módulo TDD (`strict-tdd.md` para apply, `strict-tdd-verify.md` para verify) se carga **únicamente** cuando TDD está activo:

```
sdd-apply:
├── IF strict_tdd: true AND test runner exists
│   └── Cargar y seguir skills/sdd-apply/strict-tdd.md
│       (REEMPLAZA el flujo estándar de implementación)
│
└── IF strict_tdd: false OR no test runner
    └── strict-tdd.md NUNCA se lee, nunca se procesa
        → Cero tokens consumidos por instrucciones TDD

sdd-verify:
├── IF strict_tdd: true AND test runner exists
│   └── Cargar skills/sdd-verify/strict-tdd-verify.md
│       (AGREGA pasos adicionales de verificación)
│
└── IF strict_tdd: false OR no test runner
    └── strict-tdd-verify.md NUNCA se carga
        → Verificación estándar sin overhead TDD
```

**¿Por qué importa?** Los módulos TDD son instrucciones detalladas (~280 líneas). Cargarlos cuando no se necesitan desperdiciaría tokens en cada ejecución de apply y verify. La carga condicional garantiza cero costo cuando TDD no está activo.

---

## Ciclo TDD por Tarea

Cuando TDD Estricto está activo, **cada tarea** del `tasks.md` sigue este ciclo completo:

### Step 0: SAFETY NET 🛡️

> Solo cuando se modifican archivos existentes. Omitir para archivos nuevos.

```
Ejecutar tests existentes para los archivos a modificar
├── Capturar baseline: "{N} tests passing"
├── Si alguno FALLA → STOP
│   └── Reportar como "pre-existing failure"
│   └── NO corregir fallas pre-existentes — reportar al orquestador
└── Este baseline prueba que no rompiste lo que ya funcionaba
```

### Step 1: UNDERSTAND 📖

```
├── Leer descripción de la tarea
├── Leer escenarios de spec relevantes (son tus criterios de aceptación)
├── Leer decisiones del design (restringen tu enfoque)
├── Leer código y tests existentes (matchear el estilo)
└── Determinar capa de test (ver "Selección de Capa de Test")
```

### Step 2: RED 🔴

Escribir un test que falla **primero**:

```
├── Escribir test(s) que describen el comportamiento esperado desde la spec
├── Preferir funciones puras donde sea posible (sin side effects = fácil de testear)
├── El test DEBE referenciar código de producción que NO existe aún
│   (esto garantiza que falla — no hace falta ejecutar para confirmar)
├── Si el código/función ya existe:
│   └── Escribir test para el NUEVO comportamiento que AÚN no está implementado
└── GATE: No proceder a GREEN hasta que el test esté escrito
```

### Step 3: GREEN 🟢

Escribir el **MÍNIMO** código para que pase:

```
├── Implementar SOLO lo que el test necesita
├── Fake It es VÁLIDO aquí (valores hardcodeados están OK)
├── EJECUTAR tests → deben PASAR
│   ├── ✅ Pasó → proceder a TRIANGULATE o REFACTOR
│   └── ❌ Falló → corregir la implementación, NO el test
└── GATE: No proceder hasta que GREEN se confirme por ejecución
```

> **Fake It**: Retornar un valor hardcodeado es una técnica TDD legítima. La triangulación (Step 4) forzará la generalización.

### Step 4: TRIANGULATE 🔺

> **OBLIGATORIO** para la mayoría de tareas. Se necesita una razón convincente para omitirlo.

```
├── Agregar un segundo test case con DIFERENTES inputs/outputs esperados
├── EJECUTAR tests → si Fake It se rompe (hardcoded ya no funciona):
│   └── Generalizar a lógica real (este es todo el punto)
├── Repetir hasta cubrir TODOS los escenarios de spec para esta tarea
├── Cada pass: escribir test → ejecutar → corregir implementación
├── MÍNIMO: 2 test cases por comportamiento (happy path + un edge case)
│   ├── Un test con datos que producen resultado NON-EMPTY/NON-TRIVIAL
│   └── Un test con datos que ejercitan un code path DIFERENTE
└── GATE: Todos los escenarios de spec para esta tarea deben tener tests
```

**CUIDADO con GREEN que pasa trivialmente:**

| Situación | ¿Es un GREEN real? |
|-----------|-------------------|
| Test pasa porque el componente no se renderiza | ❌ No |
| Test pasa porque un loop itera 0 veces | ❌ No |
| Test pasa porque el setup no triggerea el code path | ❌ No |
| Código de producción EJECUTÓ y produjo el output esperado | ✅ Sí |

**Omitir triangulación SOLO cuando TODO esto es verdad:**
- La tarea es puramente estructural (config, constantes, exports de tipos)
- Hay literalmente UN solo output posible (sin branching, sin lógica)
- Se anota explícitamente: "Triangulation skipped: {razón}"

### Step 5: REFACTOR ♻️

Mejorar sin cambiar comportamiento:

```
├── Extraer constantes (eliminar magic numbers)
├── Extraer funciones (reducir complejidad ciclomática)
├── Mejorar naming, eliminar duplicación
├── Aplicar Boy Scout Rule: dejar el código más limpio de como lo encontraste
├── EJECUTAR tests después de CADA cambio de refactoring → deben SEGUIR pasando
│   ├── ✅ Siguen pasando → refactoring es seguro, continuar
│   └── ❌ Falló → REVERTIR ese paso de refactoring, intentar más pequeño
└── GATE: Tests green después de CADA cambio de refactoring
```

### Step 6: Mark [x] ✅

Marcar la tarea como completa en `tasks.md` y anotar desviaciones o issues descubiertos.

---

## Selección de Capa de Test

Basado en las capacidades de testing detectadas por `sdd-init`, elegir la capa apropiada:

```
¿Qué hace la tarea?
│
├── Lógica pura, utilidad, cálculo, transformación de datos
│   └── Unit test (siempre disponible si hay test runner)
│
├── Renderizado de componente, interacción de usuario, cambios de estado
│   ├── IF herramientas de integration disponibles → Integration test
│   └── IF NOT → Unit test con mocks (degradar gracefully)
│
├── Flujo multi-componente, interacción API, context/provider
│   ├── IF herramientas de integration disponibles → Integration test
│   └── IF NOT → Unit test con mocks
│
├── Flujo de negocio crítico, journey completo, navegación cross-page
│   ├── IF herramientas E2E disponibles → E2E test
│   ├── IF NOT pero integration disponible → Integration test
│   └── IF ninguno → Unit test (degradar gracefully)
│
└── Default: Unit test (siempre el fallback)
```

**Regla clave**: Usar la capa MÁS ALTA disponible que encaje con la tarea. Pero NUNCA omitir una tarea porque una capa no está disponible — degradar a la siguiente capa disponible.

---

## Calidad de Assertions

### Patrones PROHIBIDOS (NUNCA escribir estos)

```
# TAUTOLOGÍAS — el test no prueba nada
expect(true).toBe(true)              # ❌ Tautología
expect(1).toBe(1)                    # ❌ Sin código de producción involucrado
assert True                          # ❌ Siempre pasa

# COLECCIONES VACÍAS sin contexto de setup
expect(result).toEqual([])           # ❌ Solo válido si el setup PRODUCE vacío intencionalmente
assert len(result) == 0              # ❌ ¿Por qué está vacío? ¿Se ejecutó código de producción?

# ASSERTIONS SOLO DE TIPO — prueban existencia, no comportamiento
expect(result).toBeDefined()         # ❌ Solo — ¿CUÁL es el valor?
expect(typeof result).toBe('object') # ❌ Solo — ¿qué CONTIENE el objeto?

# GHOST LOOPS — assertion dentro de loop que itera 0 veces
const items = screen.queryAllByTestId("item");  // retorna []
for (const item of items) {
  expect(item).toHaveTextContent("value");       // ❌ NUNCA SE EJECUTA
}
// FIX: assertar que la colección es non-empty PRIMERO:
expect(items).toHaveLength(3);                   // ✅ Prueba que items existen
```

### Qué hace una assertion REAL

Cada assertion DEBE satisfacer TODOS estos criterios:

1. **Llama código de producción** — el test invoca una función, método o componente de la implementación
2. **Asserta un output específico** — compara contra un valor esperado concreto derivado de la spec
3. **FALLARÍA si el código de producción estuviera mal** — si cambiás la lógica, ESTE test se rompe

```
# ✅ ASSERTIONS REALES
expect(calculateDiscount(100, 10)).toBe(10)                      # Input real → output real
expect(screen.getByText('Welcome, John')).toBeInTheDocument()     # Renderizado desde datos
assert response.status_code == 403                                # Respuesta HTTP real
```

### Regla de Colección Vacía

`expect(result).toEqual([])` o `assert len(result) == 0` es SOLO válido cuando:

1. El setup establece una precondición específica que DEBERÍA producir resultado vacío
2. El código de producción efectivamente ejecutó y procesó datos para llegar a vacío
3. Un test companion con diferente setup produce resultado NON-EMPTY (triangulación)

---

## Verificación TDD (sdd-verify)

Cuando Strict TDD está activo, `sdd-verify` carga `strict-tdd-verify.md` que agrega estos pasos obligatorios:

### TDD Compliance Check

Lee el artefacto `apply-progress` y verifica que TDD fue realmente seguido:

| Verificación | Qué chequea |
|--------------|-------------|
| TDD Evidence reported | ¿Existe la tabla "TDD Cycle Evidence" en apply-progress? |
| All tasks have tests | ¿Cada tarea tiene archivo de test? |
| RED confirmed | ¿Los archivos de test referenciados existen en el codebase? |
| GREEN confirmed | ¿Los tests pasan cuando se ejecutan ahora? |
| Triangulation adequate | ¿Las tareas con múltiples escenarios tienen múltiples test cases? |
| Safety Net for modified files | ¿Los archivos modificados tuvieron safety net? |

Si NO se encuentra tabla de TDD evidence → CRITICAL: el protocolo no fue seguido.

### Changed File Coverage

Cuando la herramienta de coverage está disponible, reporta cobertura por archivo modificado:

```
FOR EACH archivo creado o modificado en este cambio:
├── Line coverage %
├── Branch coverage % (si disponible)
├── Rangos de líneas no cubiertas (específicas)
└── Rating:
    ├── ≥ 95% → ✅ Excellent
    ├── ≥ 80% → ⚠️ Acceptable
    └── < 80% → ⚠️ Low (listar líneas no cubiertas)
```

> **Umbral**: < 80% de cobertura en archivos modificados genera WARNING.

### Quality Metrics

Ejecuta herramientas de calidad **solo sobre archivos modificados**, solo si están disponibles:

| Herramienta | Qué ejecuta | Severidad |
|-------------|-------------|-----------|
| Linter | `eslint`, `ruff`, `golangci-lint`, etc. en archivos cambiados | WARNING para errores |
| Type Checker | `tsc --noEmit`, `mypy`, etc. (filtrar output a archivos cambiados) | WARNING para errores |

Si las herramientas no están disponibles, simplemente se reporta "Not available" — no es falla.

### Assertion Quality Audit (OBLIGATORIO)

Escanea TODOS los archivos de test creados o modificados y busca assertions triviales:

```
FOR EACH archivo de test:
├── Escanear patrones PROHIBIDOS:
│   ├── Tautologías (expect(true).toBe(true))
│   ├── Colecciones vacías sin companion non-empty
│   ├── Assertions solo de tipo sin assertion de valor
│   ├── Assertions que nunca llaman código de producción
│   ├── Ghost loops (assertions en loop sobre colección vacía)
│   └── Ciclo TDD incompleto (test pasa porque precondiciones no ejecutan el code path)
│
├── Clasificar cada violación:
│   ├── CRITICAL: tautología — el test no prueba NADA
│   ├── CRITICAL: assertion sin llamada a código de producción
│   ├── WARNING: colección vacía sin companion non-empty test
│   └── WARNING: assertion solo de tipo sin assertion de valor
│
└── Verificar calidad de triangulación:
    ├── Contar test cases distintos por comportamiento
    ├── Si todos los tests assertan el MISMO tipo de valor → WARNING
    └── Una buena triangulación tiene tests assertando valores DIFERENTES
```

---

## Evidencia TDD

La fase `sdd-apply` DEBE incluir esta tabla en su resumen de retorno:

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `path/test.ext` | Unit | ✅ 5/5 | ✅ Written | ✅ Passed | ✅ 3 cases | ✅ Clean |
| 1.2 | `path/test.ext` | Integration | N/A (new) | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean |
| 1.3 | `path/test.ext` | Unit | ✅ 2/2 | ✅ Written | ✅ Passed | ✅ 2 cases | ➖ None needed |

**Definición de columnas:**

| Columna | Significado |
|---------|-------------|
| **Safety Net** | Tests pre-existentes ejecutados antes de modificar. "N/A (new)" para archivos nuevos. |
| **RED** | Test escrito primero, referenciando código que no existe aún. Siempre "✅ Written". |
| **GREEN** | Tests ejecutados y pasando tras implementación mínima. Debe mostrar resultado de ejecución. |
| **TRIANGULATE** | Test cases adicionales para forzar lógica real. "➖ Single" si spec tiene un solo escenario. |
| **REFACTOR** | Código mejorado con tests aún pasando. "➖ None needed" si el código ya estaba limpio. |

---

## Preferencia por Funciones Puras

TDD empuja naturalmente hacia funciones puras. El modo estricto lo refuerza:

```
✅ PREFERIR (pura — fácil de testear):
function calculateDiscount(price: number, quantity: number): number {
  return quantity >= 5 ? price * quantity * 0.1 : 0
}

❌ EVITAR (impura — difícil de testear):
function calculateDiscount(item: Item) {
  globalState.lastDiscount = item.price * 0.1  // side effect
  updateDOM()                                   // side effect
  return globalState.lastDiscount
}
```

**¿Por qué?** Las funciones puras son determinísticas (misma entrada → misma salida), sin side effects, y trivialmente testeables.

---

## Approval Testing (para refactoring)

Cuando una tarea involucra REFACTORING de código existente (no código nuevo):

```
ANTES de tocar código de producción:
├── 1. Identificar comportamiento existente a preservar
├── 2. Escribir "approval tests" que capturen comportamiento actual:
│   ├── Llamar la función con inputs conocidos
│   ├── Assertar los outputs ACTUALES (aunque sean feos o incorrectos)
│   └── Estos tests documentan lo que el código hace AHORA
├── 3. Ejecutar approval tests → deben PASAR (describen realidad actual)
├── 4. AHORA refactorizar el código de producción
├── 5. Ejecutar approval tests de nuevo → deben SEGUIR pasando
│   ├── ✅ Pasan → refactoring preservó comportamiento
│   └── ❌ Fallan → refactoring rompió algo, revertir
└── 6. Si la spec dice que el comportamiento debe CAMBIAR:
    ├── Actualizar el approval test para reflejar NUEVO comportamiento esperado
    ├── Ejecutar → test FALLA (RED — nuevo comportamiento no implementado aún)
    └── Implementar nuevo comportamiento → GREEN
```

---

## Testing Capabilities Detection

`sdd-init` detecta automáticamente toda la infraestructura de testing del proyecto:

```
Detect testing capabilities:
│
├── Test Runner
│   ├── package.json → devDependencies: vitest, jest, mocha, ava
│   ├── package.json → scripts.test
│   ├── pyproject.toml / pytest.ini → pytest
│   ├── go.mod → go test (built-in)
│   ├── Cargo.toml → cargo test (built-in)
│   └── Makefile → make test
│
├── Test Layers
│   ├── Unit: test runner exists → AVAILABLE
│   ├── Integration:
│   │   ├── JS/TS: @testing-library/* en dependencies
│   │   ├── Python: pytest + httpx/requests-mock/factory-boy
│   │   ├── Go: net/http/httptest (built-in)
│   │   └── .NET: xUnit/NUnit + WebApplicationFactory
│   ├── E2E:
│   │   ├── playwright, cypress, selenium en dependencies
│   │   ├── Python: playwright, selenium
│   │   └── Go: chromedp
│   └── Cada capa → registrar nombre de herramienta
│
├── Coverage Tool
│   ├── JS/TS: vitest --coverage, jest --coverage, c8, nyc
│   ├── Python: coverage.py, pytest-cov
│   ├── Go: go test -cover (built-in)
│   └── .NET: coverlet
│
└── Quality Tools
    ├── Linter: eslint, pylint, ruff, golangci-lint, clippy
    ├── Type checker: tsc --noEmit, mypy, pyright, go vet
    └── Formatter: prettier, black, gofmt, rustfmt
```

Estas capabilities se persisten en `openspec/config.yaml` bajo la sección `testing:` para evitar re-detección en cada ejecución de `sdd-apply` y `sdd-verify`.

---

[← Anterior: Catálogo de Skills](./04-catalogo-skills.md) | [Volver al README](../README.md) | [Siguiente: Judgment Day →](./06-judgment-day.md)
