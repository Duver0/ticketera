# Arquitectura de ticketera

Documento técnico de referencia del Team Leader. Define topología de despliegue,
estructura del monorepo, paquetes compartidos, flujo de build, Prisma en serverless
y estándares de código. Los agentes de implementación (backend/frontend/ui-ux)
deben ceñirse a lo aquí descrito.

---

## 1. Resumen de decisiones

| Tema | Decisión |
|------|----------|
| Monorepo | Bun workspaces (`apps/*`, `packages/*`) |
| Backend | NestJS 11 → serverless function en Vercel |
| Frontend | Next.js 15 (App Router) en Vercel |
| DB | Neon Postgres + Prisma (`@prisma/client` v6) |
| Auth | Auth.js v5 (GitHub OAuth), roles `admin`/`agente`/`usuario` |
| Tipos compartidos | `packages/types` (única fuente de verdad) |
| Patrón State | Máquina de estados en el backend (ver `docs/state-machine.md`) |
| Formato de error | `{ error: { code, message, details? } }` (ver `docs/api-contract.md`) |
| Topología Vercel | **DOS proyectos** (justificado en §2) |

---

## 2. Topología de despliegue (Vercel)

### Decisión: DOS proyectos Vercel

- **Proyecto `ticketera-web`** → `https://ticketera-sigma.vercel.app` (Next.js).
- **Proyecto `ticketera-api`** → `https://ticketera-api.vercel.app` (NestJS serverless).

### ¿Por qué dos proyectos y no uno con rewrite `/api/*`?

Se evaluó la alternativa de **un solo proyecto** donde el NestJS se sirve bajo
`/api/v1/*` vía `vercel.json` rewrites y Next maneja el resto en el mismo dominio.

- **Ventaja de un solo proyecto**: la cookie de sesión de Auth.js es first-party
  (same-site), por lo que el API la recibe automáticamente en cada request; auth
  trivial, sin CORS.
- **Inconvenientes de un solo proyecto**: el build combinado acopla frontend y
  backend (un cambio en el API fuerza rebuild del sitio), se comparte el mismo
  presupuesto de funcion y el routing `/api/v1/*` vs `/api/auth/*` (Auth.js) se
  vuelve frágil; además el free tier de Vercel penaliza funciones grandes embebidas
  en el sitio.

- **Ventaja de dos proyectos (elegido)**: despliegue, escalado y rollback
  independientes; el API es una función acotada; el dominio del API es estable y
  versionable (`/api/v1`). El costo es resolver el auth cross-origin.

### Cómo se resuelve el auth cross-origin (clave de la decisión)

Auth.js usa **estrategia JWT** (`session: { strategy: 'jwt' }`). El token de sesión
se firma con `AUTH_SECRET`. El flujo:

1. El browser se autentica contra Next (`/api/auth/*`). La cookie es first-party
   para `ticketera-sigma.vercel.app` y **no** se envía a `ticketera-api`.
2. El Web **nunca** llama al API directamente desde el browser. En su lugar usa el
   **proxy same-origin** `apps/web/src/app/api/proxy/[...path]/route.ts`.
3. Ese route handler (server-side) lee el JWT con `getToken({ req, secret: AUTH_SECRET })`
   y reenvía la petición a `NEXT_PUBLIC_API_URL` con `Authorization: Bearer <jwt>`.
4. El API (NestJS) valida el Bearer JWT con el **mismo `AUTH_SECRET`** usando
   `@nestjs/jwt` y popula `req.user` (`RequestUser`).

Esto evita CORS, mantiene el token fuera del browser y desacopla los despliegues.
Ver `apps/web/src/app/api/proxy` y `apps/web/src/lib/api.ts`.

> Nota: si en el futuro se prefiere same-domain, basta con mover el API bajo un
> rewrite y leer la cookie directamente; el contrato de la API no cambia.

### Variables de entorno (resumen; detalle en `docs/deploy.md`)

- Web: `NEXT_PUBLIC_API_URL`, `AUTH_URL`, `AUTH_SECRET`, `AUTH_GITHUB_ID`,
  `AUTH_GITHUB_SECRET`.
- API: `DATABASE_URL`, `AUTH_SECRET`, `WEB_ORIGIN` (CORS), `PORT` (local).

`AUTH_SECRET` debe ser **idéntico** en ambos proyectos.

---

## 3. Estructura de carpetas del monorepo

```
ticketera/
  apps/
    api/                     # NestJS -> Vercel serverless (proyecto ticketera-api)
      src/
        main.ts             # bootstrap local (nest start)
        lambda.ts           # handler serverless (Vercel)
        app.module.ts       # módulo raíz (importa PrismaModule + ConfigModule)
        prisma/
          prisma.service.ts # PrismaService extends PrismaClient
          prisma.module.ts  # @Global, exporta PrismaService
        common/
          errors/
            error-codes.ts  # ErrorCodes + AppError
          filters/
            all-exceptions.filter.ts  # formato de error global
        modules/            # (backend) auth, projects, tickets, comments, ...
      prisma/
        schema.prisma       # fuente de verdad de la DB
      vercel.json
      nest-cli.json
      tsconfig.json
    web/                    # Next.js App Router (proyecto ticketera-web)
      src/
        app/
          layout.tsx
          globals.css
          login/page.tsx            # pantalla de login (GitHub OAuth)
          (app)/                    # grupo de rutas autenticadas
            layout.tsx
            page.tsx                # dashboard
            tickets/...             # listado, detalle, creación
            board/page.tsx          # vista Kanban
            admin/page.tsx          # panel de admin
            profile/page.tsx
          api/
            auth/[...nextauth]/route.ts
            proxy/[...path]/route.ts  # proxy same-origin al API
        providers.tsx       # SessionProvider + React Query (en src/)
        auth.ts             # config Auth.js (en src/)
        lib/api.ts          # cliente tipado (usa el proxy)
        middleware.ts       # protege rutas con Auth.js
      next.config.mjs
      vercel.json
      tailwind.config.ts
  packages/
    types/                  # @ticketera/types — DTOs + enums compartidos
      src/index.ts
  docs/
    architecture.md
    state-machine.md
    api-contract.md
    deploy.md
  package.json              # workspaces + scripts bun
  tsconfig.base.json        # strict, sin any
```

Regla de frontera: **frontend y backend NO comparten lógica, solo tipos**.
Todo contrato (enums, DTOs, `ApiError`, `ApiSuccess`) vive en `packages/types`
y se importa como `@ticketera/types` en ambos lados (`paths` en cada tsconfig).

---

## 4. Paquetes compartidos

- **`@ticketera/types`** (existe): tipos de dominio, DTOs request/response y la
  envoltura de error. Es la única fuente de verdad; el backend los usa para los
  DTOs de class-validator (vía `implements` cuando aplique) y el frontend para
  tipar fetch/React Query.
- **`packages/sdk`** (futuro, opcional): un wrapper `fetch` generado a partir de
  los mismos tipos. Por ahora el cliente vive en `apps/web/src/lib/api.ts`. No se
  crea aún para evitar duplicar responsabilidad con `lib/api.ts`.
- **`packages/design-tokens`** (futuro, ui-ux): colores/espaciados de Tailwind.
  Hoy hay un `tailwind.config.ts` mínimo en `apps/web`.

---

## 5. Flujo de build

- **Raíz**: `bun install` resuelve el workspace. Scripts agrupados con
  `bun run --filter`.
- **API**: `bun run build` → `prisma generate && nest build` → `dist/` con
  `main.js` (local) y `lambda.js` (handler Vercel).
- **Web**: `bun run build` → `next build` → `.next/`.
- **Web transpila** `@ticketera/types` (`transpilePackages`) para evitar problemas
  de ESM/CJS en Next.

---

## 6. Prisma en serverless

- `DATABASE_URL` apunta al **pooler** de Neon (`-pooler.sa-east-1`, `connection_limit=1`).
  Es obligatorio en serverless para no agotar conexiones.
- `prisma generate` se ejecuta en el build del API (`bun run build`).
- En runtime, `PrismaService` extiende `PrismaClient` y se instancia **una vez por
  container** (Nest la cachea en el módulo global). Los cold starts abren conexión;
  los warm la reusan. No se llama `$disconnect` en cada request.
- **Migraciones**: `prisma migrate deploy` en el primer despliegue de producción
  (ver `docs/deploy.md`). No se corren automáticamente en build.
- El binary engine de Prisma debe incluirse en la función; `vercel.json` del API
  usa `includeFiles: "dist/**"` y `runtime: nodejs20.x`. Si falla el empaquetado
  del engine, el ajuste conocido es fijar `binaryTargets = ["native", "rhel-openssl-3.0.x"]`
  en el generator de `schema.prisma`.

---

## 7. Estándares de código

### Naming
- Inglés para identificadores (clases, métodos, variables, DTOs, rutas).
- Español para comentarios de diseño/planificación y mensajes de error visibles.
- Módulos Nest: `nombre.module.ts`, `nombre.service.ts`, `nombre.controller.ts`,
  `dto/*.dto.ts`, `entities/*.entity.ts`.
- DTOs de entrada: `CreateXxxDto`, `UpdateXxxDto`, `XxxQueryDto`.
- Enums de Prisma en `snake_case` (Prisma lo exige: `en_progreso`); en TS se
  reflejan como string-literals en `packages/types` (mismo valor).

### Manejo de errores global
- Un único formato: `{ "error": { "code": string, "message": string, "details?": unknown } }`.
- `AllExceptionsFilter` normaliza toda excepción (ver `apps/api/src/common/filters`).
- Los servicios lanzan `AppError(code, message, status, details?)` (ver
  `error-codes.ts`) en lugar de `HttpException` crudo, para garantizar `code`.
- Errores de Prisma (P2025, P2002, etc.) se mapean en el servicio a `AppError`
  con código de dominio (`TICKET_NOT_FOUND`, `TICKET_KEY_CONFLICT`, …).

### Validación
- `ValidationPipe` global con `whitelist`, `transform`, `forbidNonWhitelisted`.
- Todo body de entrada usa `class-validator` (`@IsString`, `@IsEnum`, `@IsUUID`, …)
  y `class-transformer` para tipos. Los DTOs pueden `implements` los tipos de
  `packages/types` para mantener coherencia.

### Estructura de módulos NestJS
- Patrón **Controller → Service → PrismaService** (sin repositorios separados
  salvo que la consulta sea compleja; Prisma ya es el repositorio).
- `PrismaModule` es `@Global`; los feature modules solo importan lo suyo.
- Auth: `AuthModule` con guard `JwtAuthGuard` que valida el Bearer y popula
  `RequestUser` (`@ticketera/types`). Roles vía decorador `@Roles('admin')` +
  `RolesGuard`.
- Autorización por **proyecto** (membresía) se valida en el service con el
  `projectId` del recurso, no solo con el rol global.

### Convenciones de commits
- Formato: `tipo(alcance): resumen`. `tipo` ∈ {feat, fix, docs, refactor, test,
  chore, build}. Ej.: `feat(tickets): transiciones de estado con guard por rol`.
- Mensajes en español; identificadores en inglés.
- Rama principal `main`; features en `feat/...`, `fix/...`.

### Compartición de tipos
- Backend importa `@ticketera/types` en DTOs, responses y el filtro de error.
- Frontend importa `@ticketera/types` en `lib/api.ts`, hooks de React Query y
  componentes.
- Nunca se duplica un enum/DTO: si cambia el contrato, se edita `packages/types`
  y se propaga. `tsconfig.base.json` + `paths` mantienen resolución en dev.
