# Despliegue (Vercel) y variables de entorno

Guía para el orquestador / devops. **No se corren migraciones ni deploys desde
este andamiaje**; aquí solo se documentan los valores y pasos.

---

## 1. Topología elegida

- **Proyecto `ticketera-web`** → `https://ticketera-sigma.vercel.app` (Next.js, raíz del repo = `apps/web`).
- **Proyecto `ticketera-api`** → `https://ticketera-api.vercel.app` (NestJS serverless, raíz del repo = `apps/api`).

Justificación en `docs/architecture.md` §2. El auth cross-origin se resuelve con
JWT Bearer compartido (`AUTH_SECRET`) a través del proxy same-origin del Web.

---

## 2. Variables requeridas

> ⚠️ Los valores sugeridos abajo usan los secretos ya presentes en `.env` del
> usuario (DATABASE_URL, AUTH_SECRET, AUTH_GITHUB_*). **No los commitees.** El
> `.env` del usuario ya existe; este documento solo los lista para fijarlos en
> Vercel (Environment Variables) con los mismos valores.

### Proyecto `ticketera-web` (Vercel: ticketera-sigma)

| Variable | Valor sugerido | Notas |
|----------|----------------|-------|
| `NEXT_PUBLIC_API_URL` | `https://ticketera-api.vercel.app` | Usada por el proxy server-side. |
| `AUTH_URL` | `https://ticketera-sigma.vercel.app` | Auth.js v5 la requiere en producción. |
| `AUTH_SECRET` | (mismo de `.env`) | **Debe coincidir exacto con el API.** |
| `AUTH_GITHUB_ID` | (mismo de `.env`) | GitHub OAuth App client id. |
| `AUTH_GITHUB_SECRET` | (mismo de `.env`) | GitHub OAuth App secret. |

GitHub OAuth App:
- Homepage: `https://ticketera-sigma.vercel.app`
- Callback: `https://ticketera-sigma.vercel.app/api/auth/callback/github`
- En local el callback es `http://localhost:3000/api/auth/callback/github`.

### Proyecto `ticketera-api` (Vercel: ticketera-api)

| Variable | Valor sugerido | Notas |
|----------|----------------|-------|
| `DATABASE_URL` | (mismo de `.env`, pooled `connection_limit=1`) | Neon Postgres. |
| `AUTH_SECRET` | (mismo de `.env`) | Valida el Bearer JWT del Web. |
| `WEB_ORIGIN` | `https://ticketera-sigma.vercel.app` | CORS allow-origin (si se llama directo; con proxy no es estrictamente necesario). |
| `PORT` | `3001` | Solo local (`nest start`). En Vercel lo ignora. |

> El API **no** necesita `AUTH_GITHUB_*` (la autenticación la hace Auth.js en el
> Web y el API solo valida el JWT resultante con `AUTH_SECRET`).

### Variables opcionales / solo local

| Variable | Dónde | Secreta | Notas |
|----------|-------|:-------:|-------|
| `PORT` | API (solo local) | no | `main.ts` usa `process.env.PORT ?? 3001`. Vercel lo ignora (el handler es `lambda.js`). |
| `ADMIN_EMAIL` | API (opcional) | no | Si está definida, `bun prisma/seed.ts` asegura que ese usuario exista y tenga rol `admin`. |
| `VERCEL_TOKEN` | local / CI | sí | Token de Vercel CLI para `vercel --prod` o pipelines. **No va a ningún proyecto Vercel**, solo a tu entorno. |

---

## 3. Pasos de despliegue

### 3.1 Base de datos (una sola vez)
1. El `DATABASE_URL` del `.env` ya apunta al pooler de Neon.
2. Generar cliente: `bun run prisma:generate` (también corre en build del API).
3. Migrar en producción (requiere aprobación del usuario):
   - `bun run --filter @ticketera/api prisma:migrate` (dev) o
   - `bunx prisma migrate deploy` contra `DATABASE_URL` de prod (CI/Vercel).
4. **No** usar `prisma db push` en prod sin revisión.

### 3.2 Proyecto API (`ticketera-api`)
- Framework: **Other** / Node. Root dir: `apps/api`.
- Build: `bun install && bun run build`.
- Output: `dist/`. Function entry: `dist/lambda.js` (serverless handler).
- Runtime: `nodejs20.x`.
- Variables: ver tabla §2 (API).
- `vercel.json` ya presente en `apps/api` como punto de partida; si Vercel no
  detecta la función automáticamente, ajustar `functions` al archivo handler o
  mover el handler a `api/lambda.ts` y reexportar desde `dist`.

### 3.3 Proyecto Web (`ticketera-sigma`)
- Framework: **Next.js**. Root dir: `apps/web`.
- Build: `bun install && bun run build`.
- Variables: ver tabla §2 (Web).
- El proxy (`apps/web/src/app/api/proxy`) reenvía a `NEXT_PUBLIC_API_URL`.

---

## 4. Notas de serverless / Prisma
- El binary engine de Prisma debe empaquetarse en la función. Si el deploy falla
  con error de engine, añadir en `generator client` de `schema.prisma`:
  `binaryTargets = ["native", "rhel-openssl-3.0.x"]`.
- `connection_limit=1` es obligatorio con el pooler de Neon en serverless.
- No llamar `$disconnect()` por request; `PrismaService` vive por container.

---

## 5. Checklist pre-producción
- [ ] `AUTH_SECRET` idéntico en ambos proyectos Vercel.
- [ ] GitHub OAuth App con callback de prod.
- [ ] `prisma migrate deploy` ejecutado contra Neon prod.
- [ ] `NEXT_PUBLIC_API_URL` apunta a `ticketera-api.vercel.app`.
- [ ] CORS `WEB_ORIGIN` configurado en API (si se usa directo alguna vez).
- [ ] Pruebas e2e (Playwright) sobre el entorno de preview.
