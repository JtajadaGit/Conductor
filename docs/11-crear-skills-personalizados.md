# 🛠️ Crear Skills Personalizados

[← Volver al README](../README.md)

## ¿Qué es una Skill?

Una skill es un conjunto autocontenido de instrucciones para agentes IA. Define patrones, convenciones y reglas que guían el comportamiento del agente cuando trabaja en un contexto específico. Las skills son el mecanismo principal para inyectar conocimiento del proyecto en los sub-agentes de Conductor.

A diferencia de la documentación tradicional (escrita para humanos), las skills están optimizadas para ser consumidas por agentes IA: concisas, accionables y enfocadas en patrones, no en explicaciones.

```
Documentación humana: "El sistema de autenticación utiliza JWT tokens
  almacenados en cookies httpOnly. Para más detalles, consulta la RFC 7519..."

Skill para IA: "Auth: JWT en httpOnly cookies. Refresh via /api/auth/refresh.
  NUNCA almacenar tokens en localStorage. Middleware: authGuard() en cada ruta protegida."
```

---

## Estructura de Archivos

```
skills/{nombre-de-la-skill}/
├── SKILL.md              ← Requerido: archivo principal de la skill
├── assets/               ← Opcional: plantillas, schemas, configuraciones
│   ├── template.py
│   └── schema.json
└── references/           ← Opcional: enlaces a documentación local
    └── docs.md           ← Apunta a archivos locales del proyecto
```

### Reglas de estructura

- `SKILL.md` es el **único archivo requerido**. Todo lo demás es opcional.
- `assets/` contiene archivos que el agente puede copiar o usar como referencia (plantillas, schemas, configs de ejemplo).
- `references/` contiene enlaces a documentación local del proyecto. **Siempre rutas locales, nunca URLs web.**

---

## Anatomía de SKILL.md

Un archivo `SKILL.md` bien construido sigue esta estructura:

### 1. Frontmatter (obligatorio)

```yaml
---
name: react-components
description: >
  Convenciones para componentes React en el proyecto.
  Trigger: Cuando se crea o modifica un componente React.
---
```

| Campo | Requerido | Descripción |
|-------|-----------|-------------|
| `name` | Sí | Identificador de la skill (minúsculas, guiones) |
| `description` | Sí | Qué hace + cuándo activarla (trigger) en un solo bloque |

El `description` debe incluir siempre la palabra **Trigger:** seguida de las condiciones de activación. El orquestador usa este trigger para decidir cuándo inyectar la skill.

### 2. When to Use (recomendado)

```markdown
## When to Use

- Al crear nuevos componentes React
- Al refactorizar componentes existentes
- Al agregar tests de componentes
```

Lista breve de situaciones donde la skill es relevante.

### 3. Critical Patterns (obligatorio)

```markdown
## Critical Patterns

- Componentes funcionales SIEMPRE. Nunca class components.
- Props tipadas con interface, no type alias.
- Nombre del archivo = nombre del componente en PascalCase.
- Un componente por archivo. Excepciones: sub-componentes internos.
- Tests colocados en `__tests__/{ComponentName}.test.tsx`.
```

Las reglas más importantes. Esto es lo que **no debe ignorarse**. El agente prioriza esta sección sobre cualquier otra.

### 4. Code Examples (recomendado)

```markdown
## Code Examples

### Componente con props tipadas
\`\`\`tsx
interface UserCardProps {
  user: User;
  onSelect: (id: string) => void;
}

export function UserCard({ user, onSelect }: UserCardProps) {
  return (
    <div onClick={() => onSelect(user.id)}>
      {user.name}
    </div>
  );
}
\`\`\`
```

Ejemplos mínimos y enfocados. No tutoriales completos; solo los patrones que el agente necesita replicar.

### 5. Commands (recomendado)

```markdown
## Commands

\`\`\`bash
# Crear componente con generador
npx plop component UserCard

# Ejecutar tests de componentes
npm test -- --testPathPattern=components

# Verificar tipos
npx tsc --noEmit
\`\`\`
```

Comandos que el agente puede ejecutar para generar, validar o testear su trabajo.

### 6. Resources (opcional)

```markdown
## Resources

- **Templates**: Ver [assets/](assets/) para plantillas de componentes
- **Guía de estilo**: Ver [references/](references/) para convenciones del proyecto
```

---

## Convenciones de Nombres

| Tipo | Patrón | Ejemplos |
|------|--------|----------|
| Skill genérica | `{tecnología}` | `react`, `fastapi`, `golang` |
| Específica del proyecto | `{proyecto}-{componente}` | `myapp-auth`, `myapp-api` |
| Testing | `{proyecto}-test-{componente}` | `myapp-test-sdk`, `myapp-test-api` |
| Workflow | `{acción}-{objetivo}` | `deploy-staging`, `skill-creator` |

### Reglas

- Siempre **minúsculas con guiones** (kebab-case).
- El nombre debe ser descriptivo sin ser verboso.
- Evita prefijos genéricos como `custom-` o `my-`.

---

## Compact Rules

Las compact rules son la versión condensada de una skill, diseñadas para ser inyectadas en el prompt de sub-agentes con mínimo consumo de tokens.

### ¿Qué son?

Cuando el orquestador lanza un sub-agente, no le pasa el `SKILL.md` completo. En su lugar, inyecta las **compact rules**: un resumen de 5-15 líneas con las reglas más críticas.

### Cómo se generan

Las compact rules se generan automáticamente al ejecutar `/skill-registry` o `sdd-init`. El skill registry escanea cada `SKILL.md`, extrae las reglas esenciales y las almacena en `.atl/skill-registry.md`.

### Cómo escribirlas bien

```markdown
## Compact Rules (ejemplo: react-components)

- Componentes funcionales SIEMPRE, nunca class components
- Props: interface (no type alias), PascalCase
- Un componente por archivo, nombre = archivo
- Tests en __tests__/{Component}.test.tsx
- Hooks custom en hooks/{useHookName}.ts
- Importaciones: react primero, luego libs externas, luego locales
```

### Principios de compact rules

| Principio | Descripción |
|-----------|-------------|
| Accionable | Cada línea es una regla ejecutable, no una observación |
| Sin explicaciones | No "porque...", solo "haz esto" |
| Priorizada | Las reglas más importantes primero |
| 5-15 líneas | Más de 15 líneas indica que la skill intenta cubrir demasiado |
| Sin contexto redundante | No repetir lo que el agente ya sabe por defecto |

---

## Registro de Skills

Después de crear una skill, debe registrarse para que el orquestador la descubra y la inyecte correctamente.

### Registro automático

Ejecuta cualquiera de estos comandos:

```
/skill-registry
"update skills"
"actualizar skills"
```

El skill registry escaneará todas las skills disponibles, generará las compact rules y actualizará `.atl/skill-registry.md`.

### Qué hace el registry

1. Escanea directorios de skills (proyecto y usuario).
2. Lee el frontmatter de cada `SKILL.md`.
3. Extrae triggers y patrones críticos.
4. Genera compact rules condensadas.
5. Escribe `.atl/skill-registry.md` con el índice completo.

### Verificación

Después de registrar, verifica que tu skill aparece en `.atl/skill-registry.md` con sus compact rules correctas.

---

## Ubicaciones de Skills

Las skills pueden vivir en varios niveles:

### En el repositorio Conductor (fuente/template)

```
Conductor/skills/                  ← Una sola copia, compartida
├── sdd-init/SKILL.md
├── sdd-apply/SKILL.md
└── ...
```

Al desplegar, se copian al directorio que cada plataforma espera. Esto evita duplicación: una sola copia de skills sirve a ambas plataformas.

### Nivel de proyecto (desplegado)

```
{raíz-del-proyecto}/.claude/skills/    ← Para Claude Code
{raíz-del-proyecto}/.github/skills/    ← Para GitHub Copilot
```

Skills específicas del proyecto. Se comparten vía git con todo el equipo.

> **Nota**: Si estás agregando una skill al template de Conductor, créala en `skills/` directamente. Se desplegará automáticamente a ambas plataformas.

### Nivel de usuario

```
~/.claude/skills/     ← Skills personales para Claude Code
~/.copilot/skills/    ← Skills personales para Copilot
~/.gemini/skills/     ← Skills personales para Gemini
~/.cursor/skills/     ← Skills personales para Cursor
```

Skills personales que aplican a todos tus proyectos.

### Prioridad y deduplicación

Cuando una skill existe en ambos niveles con el mismo nombre:

```
Proyecto:  .claude/skills/react/SKILL.md    ← GANA (prioridad alta)
Usuario:   ~/.claude/skills/react/SKILL.md  ← Ignorada (duplicada)
```

**El nivel de proyecto siempre gana.** Esto permite que un proyecto sobreescriba convenciones globales del usuario con reglas específicas.

### Skills compartidas (_shared)

```
skills/_shared/
├── persistence-contract.md
├── openspec-convention.md
└── skill-resolver.md
```

El directorio `_shared/` contiene convenciones que aplican a todas las fases SDD. No son skills individuales; son contratos compartidos que las skills de fase referencian.

---

## Ejemplo Completo: Crear una Skill "react-components"

### Paso 1: Crear la estructura

```
.claude/skills/react-components/
├── SKILL.md
└── assets/
    └── component-template.tsx
```

### Paso 2: Escribir SKILL.md

```markdown
---
name: react-components
description: >
  Convenciones para componentes React en el proyecto MiApp.
  Trigger: Cuando se crea, modifica o testea un componente React.
---

## When to Use

- Creación de nuevos componentes
- Refactorización de componentes existentes
- Escritura de tests de componentes
- Revisión de PRs que tocan componentes

## Critical Patterns

- Componentes funcionales SIEMPRE. Nunca class components.
- Props tipadas con `interface`, no `type`.
- Nombre del archivo = nombre del componente (PascalCase).
- Un componente por archivo.
- Estado local con `useState`; estado compartido con Zustand.
- Side effects en `useEffect` con cleanup obligatorio.
- Memoización solo cuando hay medición que lo justifique.

## Code Examples

### Componente estándar

```tsx
interface UserListProps {
  users: User[];
  onUserClick: (userId: string) => void;
}

export function UserList({ users, onUserClick }: UserListProps) {
  if (users.length === 0) {
    return <EmptyState message="No hay usuarios" />;
  }

  return (
    <ul>
      {users.map((user) => (
        <UserItem
          key={user.id}
          user={user}
          onClick={() => onUserClick(user.id)}
        />
      ))}
    </ul>
  );
}
```

### Test estándar

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { UserList } from '../UserList';

describe('UserList', () => {
  it('renders users', () => {
    render(<UserList users={mockUsers} onUserClick={vi.fn()} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });
});
```

## Commands

```bash
# Tests de componentes
npm test -- --testPathPattern=components

# Verificar tipos
npx tsc --noEmit

# Storybook (si está configurado)
npm run storybook
```

## Resources

- **Template**: Ver [assets/component-template.tsx](assets/component-template.tsx)
```

### Paso 3: Crear el template (opcional)

```tsx
// assets/component-template.tsx
interface {{ComponentName}}Props {
  // props aquí
}

export function {{ComponentName}}({ }: {{ComponentName}}Props) {
  return (
    <div>
      {/* contenido */}
    </div>
  );
}
```

### Paso 4: Registrar la skill

```
/skill-registry
```

### Paso 5: Verificar

Abre `.atl/skill-registry.md` y confirma que `react-components` aparece con sus compact rules.

---

## Mejores Prácticas

### Sí

- **Empieza con Critical Patterns**: es lo más importante para el agente.
- **Usa tablas para decisiones**: más fáciles de parsear que prosa narrativa.
- **Mantén ejemplos mínimos**: solo el patrón que quieres replicar.
- **Incluye Commands**: el agente puede ejecutarlos para validar su trabajo.
- **Actualiza el registry** después de crear o modificar skills.
- **Testa la skill**: usa `/skill-registry` y verifica que las compact rules sean correctas.

### No

- **No dupliques documentación existente**: referencia en lugar de copiar.
- **No incluyas explicaciones largas**: los agentes necesitan reglas, no tutoriales.
- **No uses URLs web en references**: siempre rutas locales al proyecto.
- **No crees skills para patrones triviales**: si el agente lo hace bien sin guía, no necesita una skill.
- **No pongas keywords en el body**: el agente busca en el frontmatter (description), no en el contenido.
- **No crees skills demasiado amplias**: mejor dos skills focalizadas que una genérica.

### Checklist de validación

- [ ] La skill no existe ya (verificar `skills/`).
- [ ] El patrón es reusable (no es un one-off).
- [ ] El nombre sigue las convenciones (kebab-case, descriptivo).
- [ ] El frontmatter tiene `name` y `description` con trigger.
- [ ] Critical Patterns es claro y accionable.
- [ ] Los ejemplos de código son mínimos.
- [ ] La sección Commands existe.
- [ ] Se ejecutó `/skill-registry` después de crear.

---

[← Anterior: Consumo de Tokens](./10-consumo-tokens.md) | [Volver al README](../README.md) | [Siguiente: Comandos →](./12-comandos-referencia.md)
