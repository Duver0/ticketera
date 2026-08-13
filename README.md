# ticketera

Sistema de gestión de tickets tipo **Jira** para soporte y desarrollo. Permite
crear, asignar y seguir tickets con un tablero **Kanban**, comentarios, historial
de cambios y reportes. El ciclo de vida del ticket se modela con el **patrón
State** (máquina de estados), y la autorización combina roles globales
(`admin`, `agente`, `usuario`) con membresía por proyecto.

---

## Stack

- **Monorepo** gestionado con **Bun** (`bun install`, `bun run`, `bunx`).
  - `apps/api` — **NestJS 11** → desplegado como serverless function en Vercel.
  - `apps/web` — **Next.js 15** (App Router) → desplegado en Vercel.
- **Base de datos** — **Neon Postgres** (serverless) + **Prisma** (`@prisma/client` v6).
- **Autenticación** — **Auth.js v5** (NextAuth) con **GitHub OAuth** y estrategia
  JWT. Roles `admin` / `agente` / `usuario`.
- **Tipos compartidos** — paquete `@ticketera/types` (única fuente de verdad de
  DTOs, enums y envolturas de error).
- **Tests** — Jest (API: unit + integración), Vitest (Web: componentes),
  Playwright (e2e). Ver `docs/quality-gates.md`.
- **Despliegue** — **Vercel** (free tier), backend como serverless function.

---

## Arquitectura resumida

Se despliegan **dos proyectos Vercel** independientes (justificado en
`docs/architecture.md` §2):

| Proyecto Vercel | App | URL de producción |
|-----------------|-----|-------------------|
| `ticketera-web` | `apps/web` (Next.js) | `https://ticketera-sigma.vercel.app` |
| `ticketera-api` | `apps/api` (NestJS) | `https://ticketera-api.vercel.app` |

### Auth cross-origin (clave de la decisión)
Auth.js usa estrategia **JWT** firmada con `AUTH_SECRET`. El browser se autentica
contra Next (`/api/auth/*`); la cookie es first-party para `ticketera-sigma`. El
Web **nunca** llama al API desde el browser: usa un **proxy same-origin**
(`apps/web/src/app/api/proxy/[...path]/route.ts`) que, en el servidor, lee el JWT
y lo reenvía al API con `Authorization: Bearer <jwt>`. El API valida el Bearer con
el **mismo `AUTH_SECRET`**. Esto evita CORS y mantiene el token fuera del browser.

```
Browser ──▶ ticketera-sigma (Next) ──▶ /api/proxy/* (server-side)
                                          │  getToken(AUTH_SECRET)
                                          ▼  Authorization: Bearer <jwt>
                                   ticketera-api (NestJS) ──▶ Prisma ──▶ Neon
```

### Paquete compartido
`packages/types` (`@ticketera/types`): enums (`Role`, `TicketStateValue`),
DTOs request/response y la envoltura de error. Frontend y backend **no comparten
lógica, solo tipos**.

---

## Estructura de carpetas

```
ticketera/
  apps/
    api/                     # NestJS -> Vercel serverless (ticketera-api)
      src/
        main.ts             # bootstrap local (nest start, PORT ?? 3001)
        lambda.ts           # handler serverless (Vercel)
        app.module.ts       # módulo raíz
        prisma/             # PrismaService (@Global) + schema.prisma + seed.ts
        common/             # errors (error-codes), filters, guards, decorators
        modules/            # auth, users, projects, tickets, comments,
                            # labels, attachments, notifications, health
          tickets/
            state/          # máquina de estados (TicketState, TicketContext)
      prisma/
        schema.prisma       # fuente de verdad de la DB
        seed.ts             # seed de admin (ADMIN_EMAIL)
      vercel.json
    web/                    # Next.js App Router (ticketera-web)
      src/
        app/
          login/page.tsx    # login con GitHub
          (app)/            # rutas autenticadas: dashboard, tickets, board,
                            # admin, profile
          api/
            auth/[...nextauth]/route.ts
            proxy/[...path]/route.ts   # proxy same-origin al API
        providers.tsx       # SessionProvider + React Query
        auth.ts             # config Auth.js
        lib/api.ts          # cliente tipado (usa el proxy)
        middleware.ts       # protege rutas
  packages/
    types/                  # @ticketera/types — DTOs + enums compartidos
  docs/
    architecture.md  state-machine.md  api-contract.md
    deploy.md        quality-gates.md
  package.json              # workspaces + scripts bun
  tsconfig.base.json        # strict, sin any
```

---

## Prerrequisitos

1. **Bun** instalado (>= 1.3). El proyecto usa Bun como gestor de paquetes y
   runner; no uses `npm`/`pnpm`.
2. Cuenta en **Neon** con un proyecto Postgres (obtén el `DATABASE_URL` del pooler).
3. Cuenta en **Vercel** para desplegar los dos proyectos.
4. **GitHub OAuth App**:
   - Homepage: `https://ticketera-sigma.vercel.app`
   - Callback (prod): `https://ticketera-sigma.vercel.app/api/auth/callback/github`
   - Callback (dev): `http://localhost:3000/api/auth/callback/github`
   - Las credenciales (`AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`) se ponen solo en el
     proyecto **web**.

---

## Variables de entorno

Define estas variables por proyecto en Vercel (y en `.env` local). **No commitees
`.env` ni secretos.**

| Variable | Proyecto | Secreta | Descripción |
|----------|:--------:|:-------:|-------------|
| `DATABASE_URL` | API | sí | Neon Postgres **pooled** con `connection_limit=1` (obligatorio en serverless). |
| `AUTH_SECRET` | Web **y** API | sí | Debe ser **idéntico** en ambos. Firma/valida el JWT de sesión. |
| `AUTH_GITHUB_ID` | Web | sí | Client ID de la GitHub OAuth App. |
| `AUTH_GITHUB_SECRET` | Web | sí | Client secret de la GitHub OAuth App. |
| `AUTH_URL` | Web | no | `https://ticketera-sigma.vercel.app` en prod; `http://localhost:3000` en dev. |
| `NEXT_PUBLIC_API_URL` | Web | no | URL del API: `https://ticketera-api.vercel.app` (prod) / `http://localhost:3001` (dev). |
| `WEB_ORIGIN` | API | no | Origen del Web para CORS: `https://ticketera-sigma.vercel.app`. |
| `PORT` | API (solo local) | no | `main.ts` usa `process.env.PORT ?? 3001`. Vercel lo ignora. |
| `ADMIN_EMAIL` | API (opcional) | no | Si está definida, `seed.ts` asegura que ese usuario tenga rol `admin`. |
| `VERCEL_TOKEN` | local / CI | sí | Token de Vercel CLI para `vercel --prod`. **No va a ningún proyecto Vercel.** |

> El API **no** necesita `AUTH_GITHUB_*` (la autenticación la hace Auth.js en el
> Web; el API solo valida el JWT con `AUTH_SECRET`).

---

## Puesta en marcha local

```bash
# 1. Instala dependencias del workspace
bun install

# 2. Genera el cliente Prisma (desde la raíz)
bunx prisma generate        # equivale a: cd apps/api && bun run prisma:generate

# 3. Crea la base de datos y aplica la migración inicial
bunx prisma migrate dev --name init
#   (alternativa si bunx no está en PATH en tu shell:
#    cd apps/api && ./node_modules/.bin/prisma migrate dev --name init)

# 4. Levanta el backend (puerto 3001)
bun --filter @ticketera/api dev

# 5. En otra terminal, levanta el frontend (puerto 3000)
bun --filter @ticketera/web dev
```

- API local: `http://localhost:3001/api/v1`
- Web local: `http://localhost:3000` (login con GitHub → `http://localhost:3000/api/auth/callback/github`)

> El cliente del Web resuelve las rutas del API vía el proxy same-origin
> (`/api/proxy/...`), así que no necesitas configurar CORS para desarrollo.

**Seed opcional de admin** (requiere `ADMIN_EMAIL` en el entorno de la API):
```bash
cd apps/api && bun prisma/seed.ts
```

---

## Scripts útiles

Desde la raíz del monorepo (Bun workspace filter):

```bash
# Tests
bun run --filter @ticketera/api test        # Jest (unit + integración)
bun run --filter @ticketera/web test        # Vitest (componentes)
bun run --filter @ticketera/web test:e2e    # Playwright (smoke /login)

# Typecheck / lint / build por proyecto
bun run --filter @ticketera/api typecheck
bun run --filter @ticketera/api build
bun run --filter @ticketera/web typecheck
bun run --filter @ticketera/web build

# Prisma (desde la raíz, delega en @ticketera/api)
bun run prisma:generate
bun run prisma:migrate
bun run prisma:deploy
```

Ver `docs/quality-gates.md` para los *quality gates* de merge y el estado
verificado por QA.

---

## Despliegue

Resumen: crear los dos proyectos Vercel (`ticketera-web`, `ticketera-api`),
configurar las variables de entorno por proyecto (ver tabla arriba) y desplegar
con `vercel --prod`. El build del API corre `prisma generate` y, en producción,
debe aplicarse `prisma migrate deploy` contra Neon. Pasos completos en
`docs/deploy.md`.

---

## Documentación técnica

- `docs/architecture.md` — topología Vercel, estructura del monorepo, paquetes
  compartidos, Prisma en serverless, estándares de código.
- `docs/state-machine.md` — patrón State de tickets: estados, transiciones y
  guardas por rol.
- `docs/api-contract.md` — endpoints REST, DTOs, códigos de respuesta.
- `docs/quality-gates.md` — quality gates de merge y estado de pruebas (QA).
- `docs/deploy.md` — variables de entorno y pasos de despliegue en Vercel.

---

## Convenciones de commits

Formato: `tipo(alcance): resumen`.

- `tipo` ∈ {`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`}.
- Ejemplo: `feat(tickets): transiciones de estado con guard por rol`.
- Mensajes en **español**; identificadores de código en **inglés**.
- Rama principal `main`; features en `feat/...`, `fix/...`.

> Reglas de código: TypeScript estricto sin `any`; español en comentarios de
> diseño/planificación, inglés en identificadores y comandos. Nunca commitear
> secretos ni `.env*`. Ver también `AGENTS.md`.
