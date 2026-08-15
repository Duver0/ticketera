# Contrato API REST — ticketera

Especificación estable de la API NestJS. El backend la implementa fielmente;
el frontend la consume vía el proxy (`apps/web/src/lib/api.ts`).

---

## 1. Convenciones generales

- **Base URL (prod)**: `https://ticketera-api.vercel.app/api/v1`
- **Base URL (local)**: `http://localhost:3001/api/v1`
- **Versionado**: prefijo global `api/v1` (configurado en `main.ts`/`lambda.ts`).
- **Auth**: `Authorization: Bearer <jwt>` donde `<jwt>` es el token de sesión de
  Auth.js (estrategia JWT, mismo `AUTH_SECRET`). El Web lo inyecta en el proxy.
  Endpoints sin rol indicado son públicos (ninguno en el dominio salvo Auth.js).
- **Roles**: `admin` (global) > `agente` > `usuario`. Además hay rol **por
  proyecto** (`ProjectMember.roleInProject`) que autoriza acciones a nivel proyecto.
- **Envoltura de éxito**: `{ "data": <payload> }`.
- **Formato de error** (siempre):
  ```json
  { "error": { "code": "TICKET_NOT_FOUND", "message": "Ticket no encontrado", "details": null } }
  ```
- **Validación**: bodies con `class-validator`. 422 → `code: VALIDATION_ERROR`
  con `details` = array de errores por campo.
- **IDs**: UUID (`cuid()`). Clave de ticket visible: `<PROJECT_KEY>-<n>` (ej. `SUP-12`).

### Códigos de estado por recurso

| Código | Significado | `error.code` típico |
|--------|-------------|----------------------|
| 200 | OK | — |
| 201 | Creado | — |
| 204 | Sin contenido | — |
| 400 | Body/params inválidos (no de validación) | INVALID_TRANSITION / SAME_STATE_TRANSITION |
| 401 | No autenticado | UNAUTHENTICATED |
| 403 | Rol no autorizado | FORBIDDEN / TRANSITION_NOT_ALLOWED / NOT_PROJECT_MEMBER |
| 404 | Recurso no encontrado | TICKET_NOT_FOUND / PROJECT_NOT_FOUND / … |
| 409 | Conflicto | TICKET_KEY_CONFLICT / CONFLICT |
| 422 | Error de validación de campos | VALIDATION_ERROR |
| 500 | Error interno | INTERNAL_ERROR |

### Códigos de error (`error.code`)

`INTERNAL_ERROR`, `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`,
`NOT_FOUND`, `CONFLICT`, `PROJECT_NOT_FOUND`, `TICKET_NOT_FOUND`,
`COMMENT_NOT_FOUND`, `LABEL_NOT_FOUND`, `USER_NOT_FOUND`, `NOT_PROJECT_MEMBER`,
`TICKET_KEY_CONFLICT`, `TRANSITION_NOT_ALLOWED`, `SAME_STATE_TRANSITION`,
`INVALID_TRANSITION`, `ASSIGNEE_NOT_MEMBER`,
`ORG_SLUG_INVALID`, `ORG_SLUG_TAKEN`, `ORG_NOT_FOUND`, `ORG_ALREADY_MEMBER`,
`ORG_REQUIRED`, `INVITE_CODE_INVALID`, `NOT_ORG_ADMIN`. (Definidos en
`apps/api/src/common/errors/error-codes.ts`.)

---

## 2. Recursos y endpoints

### 2.1 Auth / Usuarios (`/users`)

| Método | Ruta | Rol | Body | 200 | Errores |
|--------|------|-----|------|-----|---------|
| POST | `/users/sync` | autenticado | — | `SessionUser` | — |
| GET | `/users/me` | autenticado | — | `SessionUser` | UNAUTHENTICATED |
| GET | `/users` | admin | — | `SessionUser[]` | FORBIDDEN |
| GET | `/users/:id` | admin | — | `SessionUser` | USER_NOT_FOUND |
| PATCH | `/users/:id/role` | admin | `{ role: Role }` | `SessionUser` | USER_NOT_FOUND |

> `POST /users/sync` asegura que exista la fila `User` en Postgres (E1) y devuelve
> el perfil con su `role`. El Web debe llamarlo tras login (ver `auth.ts` TODO).

### 2.2 Proyectos (`/projects`)

| Método | Ruta | Rol | Body | 200 | Errores |
|--------|------|-----|------|-----|---------|
| POST | `/projects` | autenticado | `CreateProjectDto` | `ProjectDto` (201) | VALIDATION_ERROR, CONFLICT (key) |
| GET | `/projects` | autenticado | — | `ProjectDto[]` (sus membresías) | — |
| GET | `/projects/:id` | miembro | — | `ProjectDto` | PROJECT_NOT_FOUND, NOT_PROJECT_MEMBER |
| PATCH | `/projects/:id` | admin proyecto / admin global | `UpdateProjectDto` | `ProjectDto` | FORBIDDEN |
| DELETE | `/projects/:id` | admin proyecto / admin global | — | 204 | FORBIDDEN |

### 2.3 Miembros de proyecto (`/projects/:id/members`)

| Método | Ruta | Rol | Body | 200 | Errores |
|--------|------|-----|------|-----|---------|
| GET | `/projects/:id/members` | miembro | — | `ProjectMemberDto[]` | NOT_PROJECT_MEMBER |
| POST | `/projects/:id/members` | admin proyecto / admin global | `AddProjectMemberDto` | `ProjectMemberDto` (201) | USER_NOT_FOUND, FORBIDDEN |
| DELETE | `/projects/:id/members/:userId` | admin proyecto / admin global | — | 204 | FORBIDDEN |

### 2.4 Tickets (`/tickets`)

| Método | Ruta | Rol | Body | 200 | Errores |
|--------|------|-----|------|-----|---------|
| POST | `/tickets` | miembro del proyecto | `CreateTicketDto` | `TicketDto` (201) | NOT_PROJECT_MEMBER, VALIDATION_ERROR, ASSIGNEE_NOT_MEMBER |
| GET | `/tickets?<projectId>&state=&assigneeId=&reporterId=&priority=&type=&labelId=&q=&page=&pageSize=` | autenticado | — | `TicketDto[]` | `projectId` es opcional: si se omite, lista los tickets de los proyectos (y org) del usuario ("Mis tickets"); admin global sin org ve todos. Visibilidad por rol aplicada (operador solo ve `abierto`+sin asignar o asignados a él). |
| GET | `/tickets/:id` | miembro | — | `TicketDto` | TICKET_NOT_FOUND, NOT_PROJECT_MEMBER |
| PATCH | `/tickets/:id` | reportero / asignado / agente-admin-proyecto | `UpdateTicketDto` | `TicketDto` | FORBIDDEN, FORBIDDEN |
| DELETE | `/tickets/:id` | admin proyecto / admin global | — | 204 | FORBIDDEN |

`CreateTicketDto`:
```json
{ "projectId": "uuid", "title": "string", "description?": "string",
  "priority?": "baja|media|alta|urgente", "type?": "bug|feature|tarea|epic",
  "assigneeId?": "uuid", "labelIds?": ["uuid"] }
```
La API genera `number` correlativo por proyecto y `key = ${Project.key}-${number}`.

> **Alcance por organización (ver `docs/organizaciones.md`):** el `Project`
> pertenece a la organización de su creador (`Project.organizationId`, fijado en
> creación; el creador debe tener una org → `409 ORG_REQUIRED` si es org-less).
> Agregar miembros (`POST /projects/:id/members`) solo acepta usuarios cuya
> `organizationId` coincida con la del proyecto; de lo contrario → `404
> USER_NOT_FOUND` (no se revela existencia cross-org). Recomendado para el
> autocompletado del frontend: `GET /projects/:id/candidates?q=` (usuarios de la
> misma org del proyecto aún no miembros).

### 2.3b Organizaciones (`/organizations`)

| Método | Ruta | Rol | Body | 200/201 | Errores |
|--------|------|-----|------|---------|---------|
| POST | `/organizations` | autenticado (org-less) / admin global | `CreateOrganizationDto` | `OrganizationDto` (201) | `ORG_SLUG_INVALID` (422), `ORG_SLUG_TAKEN` (409), `ORG_ALREADY_MEMBER` (409) |
| POST | `/organizations/join` | autenticado (org-less) | `JoinOrganizationDto` | `OrganizationDto` (200) | `INVITE_CODE_INVALID` (404), `ORG_ALREADY_MEMBER` (409) |
| GET | `/organizations/me` | autenticado con org | — | `OrganizationDto` | `ORG_NOT_FOUND` (404) |
| GET | `/organizations/me/members` | miembro de la org | — | `OrganizationMemberDto[]` | `ORG_NOT_FOUND` (404) |
| POST | `/organizations/invite-code/rotate` | dueño de la org / admin global | — | `RotateInviteCodeResponseDto` | `ORG_NOT_FOUND` (404), `NOT_ORG_ADMIN` (403) |

- `POST /organizations`: cualquier usuario autenticado **sin org** crea su org y
  queda dueño; el **admin global** puede además pasar `ownerId`. Slug debe cumplir
  `^[a-z0-9]+(?:-[a-z0-9]+)*$` (3–40). Ya en org → `409 ORG_ALREADY_MEMBER`.
- `POST /organizations/join`: requiere `inviteCode` válido y actor sin org.
- `GET /organizations/me` incluye `inviteCode` **solo** si el actor es dueño o
  admin global.
- `POST /organizations/invite-code/rotate`: regenera el token (el anterior deja de
  funcionar). Admin global actúa como dueño de cualquier org.

`CreateOrganizationDto`: `{ "slug": "string", "ownerId?": "uuid" }`
`JoinOrganizationDto`: `{ "inviteCode": "string" }`
`OrganizationDto`: `{ "id", "slug", "ownerId", "createdAt", "memberCount", "inviteCode?" }`
`RotateInviteCodeResponseDto`: `{ "inviteCode": "string" }`
`OrganizationMemberDto`: `{ "id", "name?", "email", "role", "joinedAt" }`

> El registro (`POST /api/v1/auth/register`) también acepta `organizationSlug?` /
> `inviteCode?` para crear/unirse a org al dar de alta al usuario (ver
> `docs/organizaciones.md` §3 y `docs/auth-design.md`).

### 2.5 Transiciones de estado (`/tickets/:id/transitions`) — Patrón State

| Método | Ruta | Rol | Body | 200 | Errores |
|--------|------|-----|------|-----|---------|
| GET | `/tickets/:id/transitions` | miembro | — | `TransitionOptionDto[]` | TICKET_NOT_FOUND |
| POST | `/tickets/:id/transitions` | según guarda (ver state-machine) | `TransitionTicketDto` | `TicketDto` | TRANSITION_NOT_ALLOWED (403), INVALID_TRANSITION (400), SAME_STATE_TRANSITION (409) |

`GET /tickets/:id/transitions` devuelve **todas** las transiciones posibles desde
el estado actual, con `allowed: boolean` y `reason` cuando no lo está. El frontend
pinta solo los botones `allowed`. Ejemplo:

```json
{
  "data": [
    { "to": "en_progreso", "allowed": true },
    { "to": "en_revision", "allowed": true },
    { "to": "cerrado", "allowed": true },
    { "to": "abierto", "allowed": false, "reason": "rol_no_autorizado" },
    { "to": "resuelto", "allowed": false, "reason": "rol_no_autorizado" },
    { "to": "reabierto", "allowed": false, "reason": "rol_no_autorizado" }
  ]
}
```

`TransitionTicketDto`:
```json
{ "to": "en_progreso", "comment?": "string" }
```
Al transicionar, el service persiste `TicketHistory` (from→to, actor, ts) y,
opcionalmente, crea `Notification`. Ver `docs/state-machine.md` §6.

### 2.6 Historial (`/tickets/:id/history`)

| Método | Ruta | Rol | 200 |
|--------|------|-----|-----|
| GET | `/tickets/:id/history` | miembro | `TicketHistoryDto[]` (ordenado por `createdAt` desc) |

### 2.7 Comentarios (`/tickets/:id/comments`)

| Método | Ruta | Rol | Body | 200 | Errores |
|--------|------|-----|------|-----|---------|
| GET | `/tickets/:id/comments` | miembro | — | `CommentDto[]` | TICKET_NOT_FOUND |
| POST | `/tickets/:id/comments` | miembro | `CreateCommentDto` | `CommentDto` (201) | TICKET_NOT_FOUND |
| DELETE | `/tickets/:id/comments/:commentId` | autor / admin global | — | 204 | COMMENT_NOT_FOUND, FORBIDDEN |

`CreateCommentDto`: `{ "body": "string" }`.

### 2.8 Labels (`/projects/:id/labels`, `/labels/:id`)

| Método | Ruta | Rol | Body | 200 | Errores |
|--------|------|-----|------|-----|---------|
| GET | `/projects/:id/labels` | miembro | — | `LabelDto[]` | NOT_PROJECT_MEMBER |
| POST | `/projects/:id/labels` | admin proyecto / agente / admin global | `CreateLabelDto` | `LabelDto` (201) | FORBIDDEN |
| DELETE | `/labels/:id` | admin proyecto / admin global | — | 204 | LABEL_NOT_FOUND, FORBIDDEN |

Asociar label a ticket: `POST /tickets/:id/labels` `{ "labelId": "uuid" }` → 204;
desasociar: `DELETE /tickets/:id/labels/:labelId` → 204.

### 2.9 Attachments (`/tickets/:id/attachments`, `/attachments/:id`)

| Método | Ruta | Rol | Body | 200 | Errores |
|--------|------|-----|------|-----|---------|
| GET | `/tickets/:id/attachments` | miembro | — | `AttachmentDto[]` | TICKET_NOT_FOUND |
| POST | `/tickets/:id/attachments` | miembro | `CreateAttachmentDto` | `AttachmentDto` (201) | TICKET_NOT_FOUND |
| DELETE | `/attachments/:id` | uploader / admin | — | 204 | FORBIDDEN |

`CreateAttachmentDto`: `{ "filename": "string", "url": "string", "size?": number, "mimeType?": "string" }`.
(El upload binario a storage es responsabilidad del cliente; aquí solo se registra
metadata. Definir later en E3.)

### 2.10 Notificaciones (`/notifications`)

| Método | Ruta | Rol | Body | 200 |
|--------|------|-----|------|-----|
| GET | `/notifications?unread=` | autenticado | — | `NotificationDto[]` (propias, no leídas primero) |
| PATCH | `/notifications/:id/read` | dueño | — | `NotificationDto` |
| POST | `/notifications/read-all` | autenticado | — | 204 |

### 2.11 Salud

| Método | Ruta | Rol | 200 |
|--------|------|-----|-----|
| GET | `/health` | público | `{ "data": { "ok": true } }` |

---

## 3. Ejemplo de flujo (transición)

1. `POST /users/sync` → perfil con `role`.
2. `GET /projects` → elige proyecto.
3. `GET /tickets/:id/transitions` → `[{to:"en_progreso",allowed:true}, ...]`.
4. `POST /tickets/:id/transitions` body `{ "to": "en_progreso" }` → 200 `TicketDto`
   con `state: "en_progreso"`.
5. `GET /tickets/:id/history` → incluye la entrada from `abierto` → `en_progreso`.

---

## 4. Notas para el frontend

- El Web **no** llama a estos endpoints directamente; usa `api.get('/tickets/:id/transitions')`
  que resuelve a `/api/proxy/tickets/:id/transitions` (proxy same-origin).
- Para pintar acciones de ticket, siempre consultar `GET .../transitions` y habilitar
  solo las `allowed: true` (respeta rol sin hardcodear lógica en el cliente).
- Tipos de request/response importados desde `@ticketera/types`.
