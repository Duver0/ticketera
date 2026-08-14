# Organizaciones y alcance por org (ticketera)

Documento técnico del **Team Leader** que introduce el concepto de **Organización**
(`Organization`) y su alcance sobre proyectos, invitaciones de miembros,
visibilidad de tickets y auditoría. Es una **extensión** de
`docs/arquitectura-equipos-auditoria.md` (roles por proyecto, invitación y
auditoría) y se alinea con `docs/auth-design.md` (registro/login).

> **Estado:** ESPECIFICACIÓN. No contiene implementación de servicios; define
> decisiones, contratos, esquema y plan de migración. Backend/frontend/ui-ux
> deben ceñirse a lo aquí descrito.
>
> ⚠️ **GATE DE APROBACIÓN (migración):** Sigue vigente lo de
> `arquitectura-equipos-auditoria.md` §6.4 y este doc §7.4: **NO ejecutar**
> `prisma migrate dev` ni `prisma migrate deploy` sin aprobación explícita del
> usuario. El SQL es para revisión.

---

## 0. Resumen de decisiones (confirmadas por el usuario)

| # | Tema | Decisión |
|---|------|----------|
| 1 | **Org Join Flow** | **Opción A**: al registrarse un usuario puede (a) **CREAR** una organización (slug único; él queda dueño/admin de la org) o (b) **UNIRSE** a una existente mediante un `inviteCode` que genera un admin de la org. |
| 2 | **Proyecto ↔ Org** | El `Project` pertenece a una organización (la del creador). Solo los miembros de **ESA** organización pueden ser invitados/agregados al proyecto. Usuarios de OTRA org **no** son buscables ni agregables. |
| 3 | **Admin global** | `Role.admin` sigue siendo superusuario: acceso total a todas las orgs/proyectos (override del alcance por org). |
| 4 | **Nombre de org** | Solo un identificador único `slug` (sin `displayName`). |
| 5 | **Roles mantenidos** | `ProjectRole { admin, supervisor, operador }` separado de `Role` global (ver doc de equipos/auditoría). |
| 6 | **Invitación a proyecto** | `AddProjectMemberDto` acepta `email` o `userId` de usuario **EXISTENTE**; invita admin de proyecto + supervisor (el supervisor no puede otorgar `admin` de proyecto). |
| 7 | **Visibilidad (TicketPolicy)** | supervisor/admin/global-admin ven todos los tickets; operador ve (abierto y sin asignar) O (assignee=yo) O (resuelto/cerrado y assignee=yo). |
| 8 | **Auditoría** | Nueva entidad `TicketAudit` (field, fromValue, toValue, actorId) + se conserva `TicketHistory`. "Tomar ticket" y ediciones se registran en `TicketAudit`. |

---

## 1. Concepto de Organización y su alcance

Una **Organización** es la unidad de aislamiento del producto. Modela una
"empresa/equipo" cuyos miembros comparten proyectos. Reglas de alcance:

- Un `User` pertenece a **a lo sumo una** organización (`User.organizationId`,
  nullable hasta que se une). No hay membresía multi-org en v1.
- Un `Project` pertenece a **exactamente una** organización, fijada en su
  creación con la org del creador (`Project.organizationId`). No se reasigna.
- La **invitación a proyectos** está acotada por org: para agregar a alguien a un
  proyecto, ese alguien debe tener `organizationId == project.organizationId`.
- La **visibilidad de tickets** usa `ProjectRole` (resuelto vía `ProjectMember`),
  que por construcción es intra-org (solo se agrega a la org correcta). El admin
  global (`Role.admin`) sobrepasa el aislamiento.
- **Admin de org = el `owner`** (`Organization.ownerId`). No hay `OrgRole` aparte
  en v1 (ver §3.4 para posible extensión). El admin global también actúa como
  admin de cualquier org.

> Nota de diseño: el aislamiento por org se hace cumplir en el **service** (no
> solo en el controller). Toda resolución de usuario para un proyecto debe
> filtrar por `organizationId`; los listados de miembros de proyecto ya son
> intra-org porque `ProjectMember` solo se crea con usuarios de la misma org.

---

## 2. Modelo de datos (diff de `schema.prisma`)

### 2.1 Nueva entidad `Organization`

```prisma
model Organization {
  id         String   @id @default(cuid())
  slug       String   @unique // lowercase, regex alfanumérico + '-' (ver §3)
  ownerId    String
  inviteCode String   @unique // token regenerable (ver §3.3)
  createdAt  DateTime @default(now())

  owner    User          @relation("OrgOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  members  User[]        @relation("OrgMembers")
  projects Project[]

  @@index([ownerId])
}
```

### 2.2 `User.organizationId` (FK opcional)

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String?
  image        String?
  passwordHash String?
  role         Role     @default(usuario)
  createdAt    DateTime @default(now())

  organizationId String? // <-- NUEVO: nullable hasta unirse a una org
  organization   Organization? @relation("OrgMembers", fields: [organizationId], references: [id], onDelete: SetNull)

  ownedOrgs Organization[] @relation("OrgOwner") // <-- NUEVO: orgs que este user creó

  accounts Account[]
  sessions Session[]
  reportedTickets Ticket[]      @relation("ReportedTickets")
  assignedTickets Ticket[]      @relation("AssignedTickets")
  projectMembers  ProjectMember[]
  comments        Comment[]
  attachments     Attachment[]
  histories       TicketHistory[]
  audits          TicketAudit[]  // (ver doc de equipos/auditoría §4)
  notifications   Notification[]
}
```

- `onDelete: SetNull` en la relación de membresía: si se borra una org (solo
  global admin, y solo si no tiene proyectos por `Restrict`), los usuarios
  quedan `organizationId = null` (org-less), no se borran.
- `ownedOrgs` permite que un usuario sea dueño de más de una org en el futuro
  (en v1 el flujo crea a lo sumo una por usuario, pero el modelo no lo impide).

### 2.3 `Project.organizationId` (fijo al crear)

```prisma
model Project {
  id             String   @id @default(cuid())
  key            String   @unique
  name           String
  description    String?
  createdById    String
  organizationId String   // <-- NUEVO: org del creador, inmutable en v1
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)

  members  ProjectMember[]
  tickets  Ticket[]
  labels   Label[]

  @@index([createdById])
  @@index([organizationId])
}
```

- `onDelete: Restrict`: no se puede borrar una org que tenga proyectos (evita
  proyectos huérfanos). El borrado de org queda fuera de v1 salvo para global
  admin con proyecto vacío; se documenta como restricción.
- `organizationId` se setea en el service al crear el proyecto con
  `actor.organizationId`. El creador debe tener org (ver §4).

### 2.4 Relaciones resultantes

| Relación | Lado `Organization` | Lado opuesto | Borrado |
|----------|---------------------|--------------|---------|
| owner | `owner` (User) | `User.ownedOrgs` | Cascade (borrar user borra sus orgs) |
| members | `members: User[]` | `User.organization` / `User.organizationId` | SetNull en User |
| projects | `projects: Project[]` | `Project.organization` | Restrict en Project |

> No se crea ningún `enum` nuevo para organizaciones (el `slug` es `String` y el
> "admin de org" se resuelve por `ownerId` + global admin). El enum `ProjectRole`
> y el modelo `TicketAudit` siguen definidos en `arquitectura-equipos-auditoria.md`.

---

## 3. Flujo de registro / ingreso a org

### 3.1 Registro (`POST /api/v1/auth/register`) — extensión de `auth-design.md` §4

El endpoint ya existe y crea el `User` vía el API (no es Auth.js quien crea el
usuario; Auth.js solo firma el JWT después con `AUTH_SECRET`). Solo se amplía el
body para soportar las opciones A/B del Org Join Flow. **No se toca el flujo
fundamental de Auth.js** (Credentials/GitHub → `sync` → JWT firmado por Web).

`RegisterDto` (extiende el de `auth-design.md` §4):

```ts
export interface RegisterDto {
  name: string;
  email: string;
  password: string;
  organizationSlug?: string; // (a) CREAR org nueva; mutuamente excluyente con inviteCode
  inviteCode?: string;       // (b) UNIRSE a org existente por código
}
```

Reglas de validación (service; el DTO `class-validator` en backend aplica
`IsEmail`/`MinLength` para los existentes y deja `organizationSlug`/`inviteCode`
opcionales):

1. A lo sumo **uno** de `organizationSlug` / `inviteCode` puede venir.
   Ambos → `422 VALIDATION_ERROR` (o `INVITE_AMBIGUOUS` si se prefiere código
   propio; se reutiliza `VALIDATION_ERROR` para no inventar código).
2. Si `organizationSlug` presente:
   - Debe cumplir regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`, longitud 3–40.
     Incumplir → `422 ORG_SLUG_INVALID` (reutilizable como `VALIDATION_ERROR`).
   - Debe ser **único** (no existe `Organization` con ese slug). Si existe →
     `409 ORG_SLUG_TAKEN`.
   - Se crea `Organization { slug, ownerId: newUserId, inviteCode: generated }`
     y se setea `user.organizationId = org.id`. Todo en **una transacción
     Prisma** (`$transaction`) para atomicidad de slug (manejar `P2002` →
     `ORG_SLUG_TAKEN`).
3. Si `inviteCode` presente:
   - Resolver `Organization` por `inviteCode`. Inexistente/inválido →
     `404 INVITE_CODE_INVALID` (o `422`; se usa `INVITE_CODE_INVALID`).
   - Setear `user.organizationId = org.id`. (No se valida "cupo" en v1.)
4. Si **ninguno** de los dos viene: el usuario se crea **org-less**
   (`organizationId = null`). Esto cubre el flujo OAuth (`sync`) que no pasa
   estos campos. Un usuario org-less no puede crear proyectos ni ser agregado a
   ninguno hasta que se una a una org (ver §3.2 / §4).

> **Interpretación de "al registrarse puede (a) o (b)":** para credenciales se
> exige una de las dos opciones de forma natural (la UI de `/login` muestra
> "Crear organización" o "Unirme con código"). Para OAuth (GitHub) el alta es
> org-less y el ingreso a org se hace en sesión vía `POST /organizations/join`.
> Esto no rompe Auth.js: `sync` no cambia.

### 3.2 Endpoints de Organizations (nuevos)

Prefijo global `/api/v1`. Respuestas envueltas en `{ data }`; errores en
`{ error: { code, message, details? } }` (formato estándar).

| Método | Ruta | Auth | Body | 200/201 | Errores |
|--------|------|:---:|------|---------|---------|
| POST | `/organizations` | 🔓 (autenticado) | `CreateOrganizationDto` | `OrganizationDto` (201) | `ORG_SLUG_INVALID` (422), `ORG_SLUG_TAKEN` (409), `ORG_ALREADY_MEMBER` (409) |
| POST | `/organizations/join` | 🔓 (autenticado) | `JoinOrganizationDto` | `OrganizationDto` (200) | `INVITE_CODE_INVALID` (404), `ORG_ALREADY_MEMBER` (409) |
| GET | `/organizations/me` | 🔓 (autenticado) | — | `OrganizationDto` | `ORG_NOT_FOUND` (404) |
| GET | `/organizations/me/members` | 🔓 (autenticado) | — | `OrganizationMemberDto[]` | `ORG_NOT_FOUND` (404) |
| POST | `/organizations/invite-code/rotate` | 🔓 (autenticado, dueño o global admin) | — | `RotateInviteCodeResponseDto` | `ORG_NOT_FOUND` (404), `NOT_ORG_ADMIN` (403) |
| GET | `/organizations/:id` | 🔓 (global admin) | — | `OrganizationDto` | `ORG_NOT_FOUND` (404) |

Notas de autorización:
- `POST /organizations`: cualquier usuario autenticado **org-less** crea su org y
  pasa a ser `owner`. El **admin global** puede además pasar `ownerId` para
  crear una org a nombre de otro. Si el actor ya tiene org → `409
  ORG_ALREADY_MEMBER`.
  > ⚠️ **Punto a confirmar con el usuario:** la confirmación decía "crear, admin
  > global o dueño". Aquí se interpreta como "cualquier usuario autenticado
  > org-less puede crear (queda dueño); el global admin además puede asignar
  > ownerId". Si se quiere restringir la creación libre a solo global admin,
  > ajustar esta regla. El resto del doc asume la interpretación permisiva.
- `POST /organizations/join`: requiere `inviteCode` válido y que el actor esté
  **org-less**. Ya en org → `409 ORG_ALREADY_MEMBER`. (Cambio de org = dejar la
  actual primero; fuera de v1.)
- `GET /organizations/me/members`: cualquier miembro de la org ve a los demás
  miembros de su org (necesario para el autocompletado de invitación a proyectos,
  §4). El admin global ve cualquier org vía `GET /organizations/:id/members`
  (no listado aquí; se asume simétrico).
- `POST /organizations/invite-code/rotate`: solo `ownerId` de la org o
  `Role.admin` global. Regenera `inviteCode` (token nuevo, único). El código
  anterior deja de funcionar.

### 3.3 Generación y rotación de `inviteCode`

- Formato: token opaco, p.ej. `crypto.randomBytes(24).toString('base64url')`
  (o `randomUUID`). **No** deriva del slug (evita enumeración).
- Restricción `@unique` en Prisma; al rotar se genera uno nuevo y se actualiza la
  fila. Colisión improbable pero manejada con reintento en el service.
- El `inviteCode` **nunca** se expone en listados públicos; solo en
  `GET /organizations/me` para el dueño/global admin, y en
  `RotateInviteCodeResponseDto` tras rotar.

### 3.4 DTOs en `packages/types`

```ts
// --- Organization ---
export interface OrganizationDto {
  id: string;
  slug: string;
  ownerId: string;
  createdAt: string;          // ISO
  memberCount: number;
  inviteCode?: string;        // SOLO si actor es owner o global admin
}

export interface CreateOrganizationDto {
  slug: string;               // regex ^[a-z0-9]+(?:-[a-z0-9]+)*$, 3..40
  ownerId?: string;           // solo global admin; si se omite => actor = owner
}

export interface JoinOrganizationDto {
  inviteCode: string;
}

export interface RotateInviteCodeResponseDto {
  inviteCode: string;         // nuevo código
}

export interface OrganizationMemberDto {
  id: string;
  name: string | null;
  email: string;
  role: Role;                 // Role global, no ProjectRole
  joinedAt: string;           // ISO (usar User.createdAt como proxy en v1)
}
```

`RegisterDto` se amplía en el mismo archivo (ver §3.1) manteniendo
`packages/types` como fuente de verdad; el backend implementa clases
`class-validator` que `implements` estos tipos.

---

## 4. Alcance por org de invitaciones a proyecto

### 4.1 Regla central

Para agregar un miembro a un proyecto (`POST /projects/:id/members`), el usuario
objetivo (resuelto por `email` o `userId`) **debe cumplir**
`user.organizationId === project.organizationId`. De lo contrario se responde
`404 USER_NOT_FOUND` (no revelar que el usuario existe en otra org).

Esto se aplica tanto a la resolución por `email` como por `userId`, y tanto en
`AddProjectMemberDto` como en cualquier búsqueda de usuarios para el proyecto.

### 4.2 Cambios en `POST /projects/:id/members`

Servicio (especificación, sin código):

1. Autorización previa: actor = `admin` de proyecto o `supervisor` (matriz del
   doc de equipos/auditoría §7). Si no → `403 FORBIDDEN`.
2. Resolver usuario objetivo por `userId` o `email` (igual que hoy).
3. **NUEVO — filtro de org:** si `targetUser.organizationId !== project.organizationId`
   → `404 USER_NOT_FOUND`. (Incluye el caso `targetUser.organizationId === null`,
   i.e. usuario sin org: no agregable.)
4. Idempotencia (ya miembro → `200`), guard de rol supervisor→admin (→`403
   CANNOT_GRANT_PROJECT_ADMIN`), creación con `roleInProject` (default
   `operador`): igual que el doc de equipos/auditoría §2.

### 4.3 `GET /projects/:id/members` y candidatos

- `GET /projects/:id/members`: devuelve `ProjectMemberDto[]` de los miembros del
  proyecto. Por construcción son todos de la misma org (no se pudo agregar otro),
  así que el listado ya está acotado. No requiere lógica extra, pero el service
  debe seguir validando que el actor sea miembro del proyecto (membresía intra-org).
- **Sugerencia de endpoint para el autocompletado del frontend**
  (previene buscar fuera de org y mantiene el contrato estable):
  `GET /projects/:id/candidates?q=` → `OrganizationMemberDto[]` con los usuarios
  de la **misma org del proyecto** que aún **no** son `ProjectMember` de ese
  proyecto y cuyo `name`/`email` coincida con `q`. Authz: miembro del proyecto.
  Esto garantiza que la UI nunca pueda enviar un `email`/`userId` de otra org.
  - Si el proyecto no existe o el actor no es miembro → `403 NOT_PROJECT_MEMBER`
    / `404 PROJECT_NOT_FOUND`.
  - El filtro de org es **obligatorio** en esta query (no es opcional).

### 4.4 Creación de proyecto (`POST /projects`)

- El actor debe tener `organizationId` distinto de `null`. Si es org-less →
  `409 ORG_REQUIRED` (o `FORBIDDEN`; se usa `ORG_REQUIRED`).
- El service setea `project.organizationId = actor.organizationId` (no viene en
  el body; se ignora si viniera). El `createdById` se mantiene igual.
- El creador pasa a `ProjectRole.admin` automáticamente (sin cambios respecto al
  doc de equipos/auditoría).

---

## 5. Visibilidad / edición de tickets (sin cambios sustantivos, con alcance org)

Se **mantiene** `TicketPolicy` del doc de equipos/auditoría §3:

- `admin` global → ve/edita todos los tickets de cualquier proyecto (override,
  cross-org permitido por ser superusuario).
- `admin` de proyecto / `supervisor` → ven todos los del proyecto.
- `operador` → filtro `(abierto AND sin asignar) OR (assignee = yo) OR
  (resuelto/cerrado AND assignee = yo)`.

**Ajuste de alcance:** el `ProjectRole` se resuelve vía `ProjectMember`, que por
construcción pertenece a la org del proyecto (§4). Por tanto un usuario **no
puede** ser `supervisor`/`operador` en un proyecto de otra org: no fue agregado.
No se requiere lógica extra de "org" en `TicketPolicy`, pero se documenta la
invariante:

> `TicketPolicy` resuelve `projectRole` de un `userId` para un `projectId`
> consultando `ProjectMember` donde `projectId` y `userId` coincidan. Como
> `ProjectMember` solo existe para usuarios de la misma org (§4.2), el
> `projectRole` es siempre intra-org. El admin global sigue siendo la única
> excepción cross-org.

La **auditoría** (`TicketAudit` + `TicketHistory`) y el "tomar ticket" se
mantienen exactamente como en `arquitectura-equipos-auditoria.md` §4. La org no
añade columnas a `TicketAudit` (la trazabilidad ya incluye `actorId` y
`ticketId`, y el ticket cuelga de un proyecto que cuelga de una org).

---

## 6. Matriz de permisos ampliada

Leyenda: 🔓 = autenticado (`JwtAuthGuard`). Verificación en **service**:
`G` = `Role.admin` global (override total, cross-org), `OWN` = dueño de la org
(`Organization.ownerId === actor.id`), `Morg` = miembro de la org (cualquiera),
`PA` = `ProjectRole.admin`, `S` = `ProjectRole.supervisor`,
`O` = `ProjectRole.operador`, `M` = miembro de proyecto.

### 6.1 Acciones de organización

| Método | Ruta | Guard | Verificación en service |
|--------|------|:---:|--------------------------|
| POST | `/organizations` | 🔓 | `G` → puede con `ownerId` ajeno; usuario autenticado **org-less** → crea y queda `OWN`; ya en org → `409 ORG_ALREADY_MEMBER`. Slug inválido → `422 ORG_SLUG_INVALID`; duplicado → `409 ORG_SLUG_TAKEN`. |
| POST | `/organizations/join` | 🔓 | Actor **org-less** + `inviteCode` válido; ya en org → `409 ORG_ALREADY_MEMBER`; código inválido → `404 INVITE_CODE_INVALID`. |
| GET | `/organizations/me` | 🔓 | Autenticado con org → `OrganizationDto` (incluye `inviteCode` solo si `OWN`/`G`); sin org → `404 ORG_NOT_FOUND`. |
| GET | `/organizations/me/members` | 🔓 | `Morg` (cualquiera de su org) → `OrganizationMemberDto[]`; sin org → `404 ORG_NOT_FOUND`. |
| POST | `/organizations/invite-code/rotate` | 🔓 | `OWN` o `G` → regenera y devuelve nuevo `inviteCode`; si no → `403 NOT_ORG_ADMIN`. |
| GET | `/organizations/:id` | 🔓 | Solo `G` (o `OWN` de esa org); si no → `404 ORG_NOT_FOUND` (no revelar). |
| GET | `/organizations/:id/members` | 🔓 | `G` o `OWN` de esa org; si no → `403 NOT_ORG_ADMIN`. |

### 6.2 Interacción con proyectos/tickets (delta sobre la matriz del doc de equipos/auditoría)

| Método | Ruta | Guard | Verificación en service (nuevos puntos) |
|--------|------|:---:|--------------------------|
| POST | `/projects` | 🔓 | **NUEVO**: actor debe tener org (`actor.organizationId != null`) → si no, `409 ORG_REQUIRED`. `project.organizationId` se fija con la org del actor. |
| POST | `/projects/:id/members` | 🔓 | `G` o `PA` o `S`. **NUEVO**: el usuario objetivo debe tener `organizationId === project.organizationId`; si no → `404 USER_NOT_FOUND`. `S` no puede otorgar `PA`. |
| GET | `/projects/:id/members` | 🔓 | `G` o `M`. Listado ya intra-org por construcción. |
| GET | `/projects/:id/candidates` | 🔓 | `G` o `M`. **NUEVO**: solo devuelve usuarios de la **misma org del proyecto** no miembros aún. |
| GET/POST | `/tickets/*` | 🔓 | `G` → override cross-org; en caso contrario `ProjectRole` resuelto intra-org (§5). Sin cambios de visibilidad. |

### 6.3 Códigos de error nuevos

Añadir a `apps/api/src/common/errors/error-codes.ts` y sincronizar en
`docs/api-contract.md`:

`ORG_SLUG_INVALID`, `ORG_SLUG_TAKEN`, `ORG_NOT_FOUND`, `ORG_ALREADY_MEMBER`,
`ORG_REQUIRED`, `INVITE_CODE_INVALID`, `NOT_ORG_ADMIN`.

Reutilizados: `USER_NOT_FOUND` (para usuarios de otra org en invitación a
proyecto, por no revelar existencia), `FORBIDDEN`, `VALIDATION_ERROR`,
`NOT_PROJECT_MEMBER`, `PROJECT_NOT_FOUND`.

---

## 7. Plan de migración Prisma (⛔ GATE)

> Esta migración es **aditiva** a la de `arquitectura-equipos-auditoria.md` §6
> (enum `ProjectRole`, cambio de `ProjectMember.roleInProject`, tabla
> `TicketAudit`). Ambas se aplican juntas tras **una sola aprobación** del
> usuario. El orden propuesto: (1) cambios de equipos/auditoría, (2) cambios de
> organizaciones.

### 7.1 Diff de `schema.prisma` (resumen)

- **Nuevo** `model Organization { id, slug @unique, ownerId, inviteCode @unique, createdAt }`.
- **User**: añadir `organizationId String?` + relación `organization`/`ownedOrgs`.
- **Project**: añadir `organizationId String` + relación `organization` (Restrict).
- (De `arquitectura-equipos-auditoria.md`): `enum ProjectRole`,
  `ProjectMember.roleInProject ProjectRole @default(operador)`, `model TicketAudit`.

### 7.2 SQL de migración — organizaciones (para revisión)

```sql
-- 1) Tabla Organization
CREATE TABLE "Organization" (
  "id"         TEXT NOT NULL,
  "slug"       TEXT NOT NULL,
  "ownerId"    TEXT NOT NULL,
  "inviteCode" TEXT NOT NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Organization_ownerId_fkey" FOREIGN KEY ("ownerId")
      REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX "Organizacion_inviteCode_key" ON "Organization"("inviteCode");
CREATE INDEX "Organization_ownerId_idx" ON "Organization"("ownerId");

-- 2) User.organizationId (nullable, FK SetNull)
ALTER TABLE "User" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL;
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- 3) Project.organizationId (NOT NULL tras backfill)
ALTER TABLE "Project" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT;
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");
```

### 7.3 Backfill de `Project.organizationId` (filas existentes)

`Project.organizationId` es `NOT NULL`. Para datos preexistentes se requiere
asignar una org a cada proyecto. Recomendación: hacerlo con un **script Prisma**
(en lugar de SQL puro) porque debe generar `cuid()` y resolver colisiones de
`slug`. Pseudo-lógica del script:

1. Para cada `Project` con `organizationId = null`:
   - Buscar `creator = User(createdById)`.
   - Si `creator.organizationId` existe → usar esa org.
   - Si no, crear `Organization { slug: 'org-' + shortIdUnico, ownerId: creator.id,
     inviteCode: token }`, asignar `creator.organizationId`, y usarla.
   - Setear `project.organizationId = org.id`.
2. Tras el backfill, aplicar `ALTER TABLE "Project" ALTER COLUMN "organizationId"
   SET NOT NULL;`.

Si se prefiere SQL puro para revisión (asume `gen_random_uuid()` como id
temporal; en producción usar cuid vía script), el bloque sería:

```sql
-- SOLO PARA REVISIÓN: el backfill real debe usar Prisma (cuid) en producción.
DO $$
DECLARE
  r RECORD;
  v_org TEXT;
  v_slug TEXT;
BEGIN
  FOR r IN SELECT id, "createdById" FROM "Project" WHERE "organizationId" IS NULL
  LOOP
    SELECT "organizationId" INTO v_org FROM "User" WHERE id = r."createdById";
    IF v_org IS NULL THEN
      v_org := gen_random_uuid()::text;
      v_slug := 'org-' || replace(r."createdById", '-', '');
      INSERT INTO "Organization" (id, slug, "ownerId", "inviteCode", "createdAt")
      VALUES (v_org, v_slug, r."createdById", gen_random_uuid()::text, now());
      UPDATE "User" SET "organizationId" = v_org WHERE id = r."createdById";
    END IF;
    UPDATE "Project" SET "organizationId" = v_org WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE "Project" ALTER COLUMN "organizationId" SET NOT NULL;
```

> ⚠️ El bloque SQL anterior usa `gen_random_uuid()` (no `cuid()`) y un `slug`
> derivado del id que puede colisionar; es **solo para revisión**. El backfill
> definitivo en Neon debe ejecutarse con un script que genere `cuid()` y garantice
> unicidad de `slug` (reintentar con sufijo si colisiona).

### 7.4 ⛔ GATE DE APROBACIÓN (explícito, reiterado)

> **NO ejecutar `prisma migrate dev` ni `prisma migrate deploy` hasta que el
> usuario confirme explícitamente este plan (y el de `arquitectura-equipos-auditoria.md`).**
> El backend puede actualizar `schema.prisma` para `prisma generate` (tipos), pero
> la base de datos no se migra. La secuencia post-aprobación:
> 1. Usuario aprueba el SQL (§7.2 + backfill §7.3 + cambios de equipos/auditoría).
> 2. `bunx prisma migrate dev --create-only` y ajustar el `.sql` al revisado.
> 3. `bunx prisma migrate dev` (dev) / `bunx prisma migrate deploy` (Neon, vía CI).
> 4. `bunx prisma generate`.

---

## 8. Checklist para implementadores (no exhaustivo)

**Backend (`apps/api`):**
- [ ] `schema.prisma`: `model Organization`, `User.organizationId` + relaciones,
      `Project.organizationId` + relación. **No migrar sin aprobación (§7.4).**
- [ ] `packages/types`: `OrganizationDto`, `CreateOrganizationDto`,
      `JoinOrganizationDto`, `RotateInviteCodeResponseDto`,
      `OrganizationMemberDto`; extender `RegisterDto` con `organizationSlug?` /
      `inviteCode?`.
- [ ] `error-codes.ts`: `ORG_SLUG_INVALID`, `ORG_SLUG_TAKEN`, `ORG_NOT_FOUND`,
      `ORG_ALREADY_MEMBER`, `ORG_REQUIRED`, `INVITE_CODE_INVALID`, `NOT_ORG_ADMIN`.
- [ ] `AuthService.register`: lógica de org (crear org + owner, o join por código)
      en transacción; validar exclusión mutua y regex de slug.
- [ ] `OrganizationsModule` (nuevo): controller + service para los 6 endpoints de
      §3.2; generación/rotación de `inviteCode`.
- [ ] `ProjectsService`: `POST /projects` exige org del actor y fija
      `organizationId`; `POST /projects/:id/members` aplica filtro de org;
      `GET /projects/:id/candidates` (opcional pero recomendado).
- [ ] `TicketPolicy`: sin cambios de visibilidad; confirmar invariante intra-org.
- [ ] Tests: registro crea org + owner; join por código; filtro de org en
      invitación a proyecto (usuario de otra org → 404); `ORG_REQUIRED` al crear
      proyecto sin org; rotación de código solo por dueño/global admin.

**Frontend (`apps/web`):**
- [ ] `/login`: en registro por credenciales, campos "Crear organización (slug)"
      o "Unirme con código" (mutuamente excluyentes).
- [ ] Post-login (OAuth): pantalla/modal para `POST /organizations/join`
      (ingresar código) o `POST /organizations` (crear).
- [ ] `lib/api.ts` y hooks: tipar con los nuevos DTOs de `@ticketera/types`.
- [ ] Autocompletado de invitación a proyecto usa `GET /projects/:id/candidates`
      (ya filtrado por org).

**Devops:**
- [ ] Revisar y aplicar migración en Neon tras aprobación (incluye backfill de
      `Project.organizationId`). No automatizar en build.

---

## 9. Relación con otros documentos

- `docs/arquitectura-equipos-auditoria.md`: roles por proyecto, invitación por
  email, `TicketPolicy` y `TicketAudit`. Este doc **extiende** aquel con el
  aislamiento por org; la visibilidad y auditoría no cambian salvo el alcance.
- `docs/auth-design.md`: el registro aquí ampliado es el mismo endpoint
  `/api/v1/auth/register`; no se altera el flujo de Auth.js ni la emisión de JWT.
- `docs/architecture.md`: topología, monorepo, Prisma serverless (el pooler de
  Neon y `prisma generate` en build siguen igual).
- `docs/api-contract.md`: se añade la sección de recursos de Organization
  (§2.12) y se anotan los deltas de `/projects` y `/projects/:id/members`.
