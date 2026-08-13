# Quality Gates — ticketera

Define qué debe cumplirse para considerar un cambio **"listo para merge"** y los
comandos exactos por proyecto. Estado verificado por QA el **2026-08-13**.

---

## 1. Definición de "listo para merge"

Un PR puede fusionarse solo si **todos** los siguientes gates están en verde en
CI (o localmente, con el entorno apropiado):

| # | Gate | Comando (backend `apps/api`) | Comando (frontend `apps/web`) |
|---|------|------------------------------|-------------------------------|
| 1 | Lint | `bun run --filter @ticketera/api lint` | `bun run --filter @ticketera/web lint` |
| 2 | Typecheck | `bun run --filter @ticketera/api typecheck` | `bun run --filter @ticketera/web typecheck` |
| 3 | Unit/Integration tests | `bun run --filter @ticketera/api test` | `bun run --filter @ticketera/web test` |
| 4 | Build | `bun run --filter @ticketera/api build` | `bun run --filter @ticketera/web build` |
| 5 | E2E smoke | — | `bun run --filter @ticketera/web test:e2e` |

Reglas:
- **Ningún test rojo.** Los tests deben ser deterministas y aislados (mocks para
  Prisma/Auth; sin secretos reales en CI).
- **TypeScript estricto** sin errores (`tsc --noEmit`).
- **El e2e smoke de `/login` debe pasar.** El test de dashboard se OMITE si no
  hay sesión grabada (OAuth de GitHub no es automatizable); no bloquea el merge,
  pero debe documentarse cómo habilitarlo (§4).
- **No se commitea `.env*` ni secretos.** `AUTH_SECRET` se inyecta por entorno.

---

## 2. Estado verificado por QA (2026-08-13)

| Proyecto | Lint | Typecheck | Tests | Build |
|----------|------|-----------|-------|-------|
| `apps/api` (NestJS) | ⚠️ ver hallazgo B1 | ✅ verde | ✅ **37/37** (32 unit + 5 integración) | ✅ verde |
| `apps/web` (Next.js) | ⚠️ ver hallazgo B2 | ✅ verde (tras fix A1) | ✅ **4/4** unit + e2e **1 passed / 1 skipped** | ✅ verde |

Leyenda: ✅ verde · ⚠️ bloqueado por gap de tooling (no es lógica de producto).

### Cobertura del flujo crítico (máquina de estados vía API)
Validado con una prueba de **integración HTTP** que arranca el `AppModule` de
NestJS completo y sustituye `PrismaService` por un mock en memoria (aislado, sin
Neon). Cubre:
- `POST /api/v1/tickets` → 201, estado inicial `abierto`.
- `GET /api/v1/tickets/:id/transitions` → opciones permitidas según rol (`agente`
  ve `en_progreso` habilitado, `resuelto` no).
- `POST /api/v1/tickets/:id/transitions` `{to:"en_progreso"}` como **agente** →
  200, ticket en `en_progreso`, y se persiste `TicketHistory`.
- El mismo `POST /transitions` como **usuario** → 403 `TRANSITION_NOT_ALLOWED`
  (rol no habilitado), estado sin cambiar.
- Petición sin token → 401 `UNAUTHENTICATED`.

El JWT se firma con HS256 usando `AUTH_SECRET` (del `apps/api/.env`) vía el
propio `JwtService` de la app (equivalente a `jsonwebtoken`; garantiza mismo
algoritmo y secreto que el `JwtAuthGuard`). Archivo:
`apps/api/src/tickets/tickets.integration.spec.ts`.

> Nota: una prueba HTTP end-to-end contra Neon real (con usuarios `agente`/
> `usuario` ya sembrados) daría cobertura de la capa de DB. Aquí se priorizó
> determinismo y aislamiento para CI (sin secretos/DB reales).

---

## 3. Comandos exactos

```bash
# Backend (desde raíz o apps/api)
cd apps/api
bun run lint          # ⚠️ B1: eslint no instalado
bun run typecheck     # ✅ tsc --noEmit
bun run test          # ✅ jest (incluye tickets.integration.spec.ts)
bun run build         # ✅ prisma generate + nest build

# Frontend (desde raíz o apps/web)
cd apps/web
bun run lint          # ⚠️ B2: next lint requiere config inicial
bun run typecheck     # ✅ tsc --noEmit (tras fix A1)
bun run test          # ✅ vitest run (componentes)
bun run test:e2e      # ✅ playwright test (smoke /login pasa; dashboard skip)

# Raíz (corre todo por workspace)
bun run lint && bun run typecheck && bun run test
```

### Playwright (e2e)
- Config: `apps/web/playwright.config.ts` (webServer `next dev`, `baseURL`
  `http://127.0.0.1:3000` para evitar el probe IPv6 del readiness check).
- Smoke: `apps/web/e2e/login.spec.ts` — visita `/login` y afirma que el botón
  **"Iniciar sesión con GitHub"** es visible. STUBBEA `/api/auth/session` para no
  depender de DB/OAuth.
- Dashboard: `apps/web/e2e/dashboard.spec.ts` — se omite si no hay sesión grabada.

---

## 4. Cómo habilitar el e2e de dashboard (sesión grabada)

El dashboard (`/`) está protegido por el middleware de Auth.js; requiere una
cookie de sesión válida. Como GitHub OAuth no es automatizable, se graba una
sesión una vez y se reutiliza vía Playwright `storageState`:

1. Arranca el dev server: `cd apps/web && bun run dev`.
2. En una terminal: `cd apps/web && bun x playwright codegen --save-storage=playwright/.auth/user.json http://127.0.0.1:3000/login`
3. Inicia sesión manualmente con GitHub en el navegador que abre codegen.
4. Navega al dashboard (`/`) para capturar la cookie de sesión; cierra codegen.
   (Alternativa: `PWDEBUG=1 bun x playwright test` y usar
   `await context.storageState({path:'playwright/.auth/user.json'})` en un script.)
5. A partir de ahí, `bun run test:e2e` ejecuta también el test de dashboard.

En CI, proveer la sesión por secreto (`PLAYWRIGHT_STORAGE_STATE`) o grabarla en
un paso previo con credenciales de un usuario de prueba (no producción).

> Nunca ejecutar el e2e contra producción ni contra el OAuth real de GitHub en
> CI. El `BASE_URL` por defecto apunta a `127.0.0.1:3000` (local).

---

## 5. Hallazgos (QA)

### A1 — `typecheck` del web rojo por globals de Vitest  ✅ CORREGIDO (fix trivial)
- **Síntoma:** `bun run --filter @ticketera/web typecheck` fallaba con
  `Cannot find name 'describe' | 'it' | 'expect'` en `*.test.tsx`.
- **Causa:** `tsconfig.json` incluye los `*.test.tsx` pero no declara los globals
  de Vitest.
- **Fix (autorizado, tooling no lógica de producto):**
  `apps/web/src/vitest-globals.d.ts` con
  `/// <reference types="vitest/globals" />` (sin restringir el campo `types`,
  para no romper `@types/react`). Tras el fix, typecheck ✅ verde.

### B1 — `lint` del backend no ejecutable  ⚠️ GAP DE TOOLING (no es lógica de producto)
- **Síntoma:** `bun run --filter @ticketera/api lint` → `eslint: orden no encontrada` (exit 127).
- **Causa:** `package.json` declara `"lint": "eslint \"src/**/*.ts\" --fix"` pero
  **`eslint` no es una devDependency** del workspace (ni de `apps/api`).
- **Impacto:** el gate de lint del backend está bloqueado hasta instalar ESLint +
  un `.eslintrc` (p.ej. `eslint-config-next`/`@nestjs/eslint-config`). No afecta
  la compilación ni los tests.
- **Recomendación:** añadir `eslint` + config y corregir el lint antes de activar
  el gate en CI.

### B2 — `lint` del frontend requiere configuración inicial  ⚠️ GAP DE TOOLING
- **Síntoma:** `bun run --filter @ticketera/web lint` (`next lint`) entra en modo
  interactivo pidiendo configurar ESLint y sale con error (no headless).
- **Causa:** no existe configuración de ESLint para el proyecto web.
- **Impacto:** el gate de lint del frontend está bloqueado hasta ejecutar la
  configuración una vez (o migrar a la ESLint CLI).
- **Recomendación:** generar `.eslintrc.json` (p.ej. `next/core-web-vitals`) y
  volver `next lint` no interactivo.

### C — Sin bugs de lógica de producto encontrados
La máquina de estados (`apps/api/src/tickets/state/*`) coincide con
`docs/state-machine.md` §3/§5; las 14 transiciones válidas documentadas están
cubiertas por `ticket-state.spec.ts` y la integración HTTP confirma el contrato
(201/200/403/401) y la persistencia de `TicketHistory`. No se detectaron
discrepancias ni errores de autorización por rol.

---

## 6. Checklist para el orquestador (merge)
- [ ] `apps/api` typecheck ✅, test ✅ (37), build ✅
- [ ] `apps/web` typecheck ✅, test ✅ (4), build ✅, e2e smoke ✅
- [ ] B1/B2 resueltos (instalar/configurar ESLint) para activar gate de lint
- [ ] Sin secretos commiteados; `AUTH_SECRET` por entorno
