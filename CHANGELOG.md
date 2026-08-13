# Changelog — ticketera

Registro de cambios relevantes del proyecto. Formato resumido por entrega.

## MVP (2026-08-13)

Entrega inicial validada: backend NestJS + frontend Next.js compilan y las
pruebas pasan en verde (ver `docs/quality-gates.md`).

### Épicas / fases cubiertas
- **E1 — Autenticación y usuarios**
  - Auth.js v5 con GitHub OAuth (estrategia JWT).
  - `POST /users/sync` asegura la fila `User`; perfiles con rol (`admin`/`agente`/`usuario`).
  - `GET /users/me`, listado y cambio de rol (`PATCH /users/:id/role`, solo admin).
- **E2 — Proyectos y membresía**
  - CRUD de proyectos (`/projects`) y miembros (`/projects/:id/members`).
  - Autorización por proyecto (`ProjectMember.roleInProject`) además del rol global.
- **E3 — Tickets y máquina de estados**
  - CRUD de tickets (`/tickets`) con `key` correlativa `<PROJECT_KEY>-<n>`.
  - **Patrón State** (6 estados, 14 transiciones) con guardas por rol.
  - `GET/POST /tickets/:id/transitions` y persistencia en `TicketHistory`.
- **E4 — Colaboración**
  - Comentarios (`/tickets/:id/comments`), labels (`/projects/:id/labels`,
    asociación a ticket), adjuntos (metadata) y notificaciones (`/notifications`).
- **E5 — Frontend y Kanban**
  - App Router con login, dashboard, listado/detalle/creación de tickets,
    vista **Kanban** (drag & drop), panel de admin y perfil.
  - Proxy same-origin al API (`/api/proxy/*`) para auth cross-origin sin CORS.
- **E6 — Infra / Calidad**
  - Monorepo Bun, `packages/types` como fuente de verdad de contratos.
  - Prisma + Neon, serverless en Vercel (2 proyectos).
  - Quality gates: typecheck, tests (API 37/37, Web 4/4), e2e smoke.

### Notas
- `AUTH_SECRET` debe ser idéntico entre los proyectos Vercel `ticketera-web` y
  `ticketera-api`.
- Pendiente de tooling (no es lógica de producto): configurar ESLint en API y Web
  (hallazgos B1/B2 en `docs/quality-gates.md`).
