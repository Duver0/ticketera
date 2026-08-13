# AGENTS.md — ticketera

Sistema de gestión de tickets tipo Jira. Este archivo da contexto a todos los agentes de opencode.

## Visión del producto
Plataforma para crear, asignar y seguir tickets de soporte/desarrollo con roles
(`admin`, `agente`, `usuario`), tableros tipo Kanban, comentarios, historial de
cambios y reportes. El ciclo de vida del ticket se modela con el **patrón State**.

## Stack (fijado — no cambiar sin confirmar con el usuario)
- **Monorepo**: NestJS (`apps/api`, backend) + Next.js (`apps/web`, frontend).
- **Despliegue**: Vercel (free tier), backend como serverless functions.
- **Base de datos**: Neon Postgres (free) + Prisma.
- **Autenticación**: Auth.js (NextAuth) con roles admin/agente/usuario.
- **Tests**: Jest/Vitest (unit), Playwright (e2e).
- **Gestor de paquetes / runner**: Bun (`bun install`, `bun run`, `bunx`). No usar npm/pnpm.

## Arquitectura objetivo
```
ticketera/
  apps/
    api/        # NestJS -> Vercel serverless
    web/        # Next.js App Router
  packages/     # tipos compartidos, SDK cliente, tokens de diseño
  docs/         # arquitectura, contratos API, state machine, deploy
```

## Patrón State (tickets)
Estados: `abierto`, `en_progreso`, `en_revision`, `resuelto`, `cerrado`,
`reabierto`. Cada transición válida depende del rol y se registra en
`TicketHistory`. Ver `docs/state-machine.md` (lo crea team-leader).

## Convenciones
- TypeScript estricto, sin `any`.
- Commits descriptivos; español en comentarios de planificación/diseño, inglés en
  identificadores de código.
- Variables sensibles solo por env; el usuario provee las API keys.
- Nunca commitear secretos ni `.env*`.

## Agentes
Orquestador delega en: project-manager, team-leader, backend, frontend, ui-ux, qa, devops, docs.
Ver `.opencode/agent/*.md`.
