# Arquitectura: Gestión de equipo por proyecto, invitación y auditoría

Documento técnico del **Team Leader** para el feature de gestión de equipo de
soporte **por proyecto** (roles `supervisor`/`operador`), invitación por email,
visibilidad diferenciada de tickets y auditoría de ediciones.

> Estado: **ESPECIFICACIÓN**. No contiene implementación de servicios; define
> decisiones, contratos, esquema y plan de migración. Los agentes
> backend/frontend/ui-ux deben ceñirse a lo aquí descrito.

> **Extensión de alcance por organización:** el aislamiento por `Organization`
> (creación/ingreso a org, proyecto fijado a la org del creador, invitación a
> proyecto acotada a la misma org, visibilidad/auditoría intra-org) se define en
> **`docs/organizaciones.md`**. Ese doc es complementario: la visibilidad
> (`TicketPolicy`) y la auditoría (`TicketAudit`) de este documento **no cambian**
> salvo el alcance por org. La matriz de permisos ampliada (acciones de org) y el
> plan de migración combinado (con el GATE) también están en `organizaciones.md`.
>
> ⚠️ **GATE DE APROBACIÓN (migración)**: No ejecutar `prisma migrate dev` ni
> `prisma migrate deploy` sin aprobación explícita del usuario (ver §6). El SQL
> propuesto es para revisión.

---

## 0. Resumen de decisiones

| # | Tema | Decisión recomendada |
|---|------|----------------------|
| 1 | Roles | **Separar** `ProjectRole { admin, supervisor, operador }` del `Role` global. `ProjectMember.roleInProject` pasa a `ProjectRole` (default `operador`). `Role` queda solo para acceso al sistema. |
| 2 | Invitación | `AddProjectMemberDto` acepta `email` **o** `userId`. v1 = solo usuarios existentes (email inexistente → `404 USER_NOT_FOUND`). Idempotencia: si ya es miembro → `200` con el existente (no sobreescribe rol). |
| 3 | Visibilidad | `TicketPolicy` resuelve el `ProjectRole` del consultor vía `ProjectMember`. Filtro server-side: `admin` global / `admin` proyecto / `supervisor` → todos; `operador` → regla de "abierto sin asignar + asignados a mí". |
| 4 | Auditoría | **Nueva entidad `TicketAudit`** (campos editados) + **mantener `TicketHistory`** (transiciones de estado, no rompe la máquina de estados). Feed unificado `TicketActivityDto` para el frontend. |
| 5 | Contratos | Nuevo `ProjectRole`, `AddProjectMemberDto` con email, `UpdateProjectMemberDto`, `TicketAuditDto`/`TicketActivityDto`, endpoint `PATCH /projects/:id/members/:userId` y `GET /tickets/:id/activity`. |
| 6 | Migración | Crear enum `ProjectRole`; cambiar tipo de `ProjectMember.roleInProject` (backfill seguro); crear tabla `TicketAudit`. **Requiere aprobación antes de `migrate deploy`**. |
| 7 | Permisos | Matriz por endpoint: `JwtAuthGuard` (auth) + verificación en service (membresía + `ProjectRole`/`Role`). |

---

## 1. Modelo de roles (decisión 1)

### 1.1 Recomendación: separar `ProjectRole` del `Role` global

**NO reusar el enum `Role` añadiendo `supervisor`/`operador`.** Se crea un enum
nuevo y ortogonal:

```prisma
enum Role {          // GLOBAL — acceso al sistema (se mantiene igual)
  admin
  agente
  usuario
}

enum ProjectRole {   // POR PROYECTO — capacidades dentro de un proyecto
  admin      // dueño del proyecto (admin de proyecto)
  supervisor // gestiona equipo y ve/edicionea todos los tickets
  operador   // trabajador con visibilidad restringida
}
```

`ProjectMember.roleInProject` cambia de `Role` a `ProjectRole` con
`@default(operador)`.

### 1.2 Justificación

- **Preocupaciones ortogonales.** `Role` responde "¿qué puede hacer este usuario
  en el *sistema*?" (`admin` global gestiona usuarios, ve todos los proyectos).
  `ProjectRole` responde "¿qué puede hacer dentro de *este* proyecto?". Mezclarlos
  crea un *leaky abstraction*: hoy `ProjectMember.roleInProject Role @default(usuario)`
  ya es semánticamente incorrecto (el `usuario` global no significa "operador de
  proyecto").
- **Evita colisión de autorización.** Si `supervisor`/`operador` vivieran en
  `Role`, endpoints como `PATCH /users/:id/role` (solo `admin` global) tendrían
  que descartar esos valores, y el `RolesGuard` global se contaminaría.
- **Claridad en la máquina de estados.** El `state-machine.md` usa `Role` global
  para los guardas; al separar, el contexto de guarda pasa a llevar **ambos**
  (`actorRole: Role` + `projectRole?: ProjectRole`), y la transición se resuelve
  por `ProjectRole` cuando hay membresía (ver apéndice §8).
- **Default correcto.** Un miembro recién invitado es `operador` (lo más
  restrictivo), no `usuario` (que no significa nada en proyecto).

### 1.3 Mapa de capacidades por `ProjectRole`

| Capacidad | admin proyecto | supervisor | operador |
|-----------|:--------------:|:----------:|:--------:|
| Ver todos los tickets del proyecto | ✓ | ✓ | ✗ (filtro) |
| Editar cualquier ticket visible | ✓ | ✓ | ✓ (solo visibles) |
| Transicionar estados (workflow) | ✓ (override) | ✓ (flujo normal) | ⚠ limitado (ver §8) |
| Invitar miembros (email/userId) | ✓ | ✓ | ✗ |
| Cambiar rol de miembros | ✓ | ✓ (no a `admin`) | ✗ |
| Eliminar miembros | ✓ | ✓ | ✗ |
| Eliminar proyecto | ✓ | ✗ | ✗ |
| Auditoría: ver `activity` | ✓ | ✓ | ✓ (de sus tickets) |

El `admin` **global** (`Role.admin`) sigue siendo override total en cualquier
proyecto (no requiere ser miembro). El `admin` de proyecto es quien creó el
proyecto o a quien se le otorgó `ProjectRole.admin`.

---

## 2. Invitación por email (decisión 2)

### 2.1 Contrato de entrada

```ts
export interface AddProjectMemberDto {
  /** Exactamente uno de los dos es requerido (ver validación). */
  userId?: string;   // cuid; tiene prioridad si se envían ambos
  email?: string;    // email válido; resuelve usuario existente
  roleInProject: ProjectRole; // admin | supervisor | operador (default operador en service si se omite)
}
```

Regla de validación (class-validator en el DTO):
- `email` debe ser email válido → si no, `422 VALIDATION_ERROR`.
- Al menos uno de `userId`/`email` presente → si ninguno, `422 VALIDATION_ERROR`.
- Si se envían **ambos**, deben referirse a la misma persona; si `email` no
  corresponde a `userId` → `422 INVITE_TARGET_AMBIGUOUS`.
- `roleInProject` debe ser `ProjectRole` válido.

### 2.2 Lógica del servicio (especificación, no código)

1. **Autorización previa**: el actor debe ser `admin` de proyecto o `supervisor`
   (matriz §7). Si no → `403 FORBIDDEN`.
2. **Resolución del usuario objetivo**:
   - Si `userId` presente → `User.findUnique({ where: { id } })`.
   - Si solo `email` → `User.findUnique({ where: { email } })`.
   - Si no existe → **`404 USER_NOT_FOUND`** (v1: solo usuarios existentes; no se
     crea invitación pendiente).
3. **Idempotencia**: si ya existe `ProjectMember(projectId, userId)` → devolver el
   existente con **`200 OK`** (no se sobreescribe `roleInProject`; para cambiar rol
   usar `PATCH`). Esto evita downgrades accidentales al re-invitar.
4. **Creación**: si no existe → crear `ProjectMember` con `roleInProject`
   (default `operador` si el body lo omite) → `201`.
5. **Guard de rol al invitar**: un `supervisor` no puede otorgar
   `ProjectRole.admin`. Si lo intenta → `403 CANNOT_GRANT_PROJECT_ADMIN`. El
   `admin` de proyecto sí puede.

> **Futuro (fuera de v1)**: `ProjectInvitation` (email no registrado → token
> pendiente + aceptación). Por ahora se documenta como extensión; el contrato
> `AddProjectMemberDto` ya admite `email` para minimizar cambios luego.

### 2.3 Cambio de rol y baja

- `PATCH /projects/:id/members/:userId` con `UpdateProjectMemberDto
  { roleInProject: ProjectRole }`:
  - `admin` proyecto: cualquier rol.
  - `supervisor`: solo a `supervisor`/`operador` (no a `admin`).
  - No permitir degradarse a sí mismo si es el **único** `admin` del proyecto
    (evitar proyecto huérfano) → `409 LAST_PROJECT_ADMIN`.
- `DELETE /projects/:id/members/:userId` (ya existe): misma autorización que
  arriba; tampoco permite eliminar al último `admin` (`409 LAST_PROJECT_ADMIN`).

---

## 3. Visibilidad de tickets (decisión 3)

### 3.1 Resolución del rol de proyecto del consultor

Para cualquier endpoint de tickets se resuelve primero el `ProjectRole`:

- `GET /tickets?projectId=X` → `projectId` viene en query.
- `GET|PATCH|DELETE /tickets/:id` → cargar ticket → `projectId` derivado.
- `POST /tickets` → `projectId` en body.

Luego:
- Si `actorRole === 'admin'` (global) → **override**: ve y puede actuar sobre
  todos los tickets del proyecto (no se aplica filtro de visibilidad).
- Si no, buscar `ProjectMember { projectId, userId }`:
  - No existe → `403 NOT_PROJECT_MEMBER`.
  - Existe → usar `member.roleInProject` como `ProjectRole` efectivo.

Helper sugerido (en service o `TicketPolicy`):
`requireProjectMembership(projectId, userId): ProjectMember` y
`requireProjectRole(projectId, userId, [rolesPermitidos])`.

### 3.2 Reglas de filtrado (especificación)

Filtro aplicado en la consulta Prisma de listado (`GET /tickets`) como `WHERE`
**adicional** a los query params existentes (`state`, `assigneeId`,
`reporterId`), combinados con `AND`:

| Rol efectivo | Filtro de visibilidad (SQL-like) |
|--------------|----------------------------------|
| `admin` global | (ninguno — todos) |
| `admin` proyecto | (ninguno — todos) |
| `supervisor` | (ninguno — todos) |
| `operador` | `(state = 'abierto' AND assigneeId IS NULL)`<br>`OR (assigneeId = :userId)`<br>`OR (state IN ('resuelto','cerrado') AND assigneeId = :userId)` |

> Nota: la tercera cláusula del `operador` está subsumida por la segunda
> (`assigneeId = userId` cubre cualquier estado), pero se mantiene explícita
> tal como se definió el requisito para no perder intención semántica. En la
> práctica basta `(abierto AND sin asignar) OR (assignee = yo)`.

- `GET /tickets/:id` (detalle): si el rol es `operador` y el ticket no pasa el
  filtro → `403 NOT_PROJECT_MEMBER` (o `404` para no revelar existencia; se
  recomienda `403` consistente con el listado).
- `POST /tickets`: cualquier miembro puede crear; el `reporterId` = actor.
- `PATCH /tickets/:id`: solo sobre tickets visibles; además respeta la matriz de
  edición (§7) y la auditoría (§4).

### 3.3 `TicketPolicy` (lugar recomendado)

Centralizar en `apps/api/src/modules/tickets/ticket-policy.ts`
(`TicketPolicy.canViewList`, `TicketPolicy.canViewTicket`,
`TicketPolicy.visibleWhere(userId, projectRole)`). El `TicketsService` lo invoca
antes de consultar. Esto evita duplicar la lógica en controller/service y la
hace testeable.

---

## 4. Auditoría de ediciones (decisión 4)

### 4.1 Recomendación: **nueva entidad `TicketAudit`** + mantener `TicketHistory`

Se rechaza extender `TicketHistory` con columnas `field/oldValue/newValue`
porque:
- `TicketHistory` está acoplado a la máquina de estados (espera `fromState`/
  `toState` siempre presentes). Mezclar ediciones de campos rompería esa
  invariante y el `state-machine.md` §6.
- Separar por preocupación: **estado** (integridad de la máquina) vs **ediciones
  de campos** (trazabilidad de negocio).

Plan:
- `TicketHistory` **se mantiene igual** (transiciones de estado, con `actorId`).
- Se crea `TicketAudit` para cualquier cambio de campo.
- Para el frontend se expone un **feed unificado** `TicketActivityDto` que mezcla
  ambas tablas ordenadas por `createdAt` (sin duplicar escritura).

### 4.2 Esquema `TicketAudit`

```prisma
model TicketAudit {
  id        String   @id @default(cuid())
  ticketId  String
  actorId   String
  field     String   // 'title'|'description'|'priority'|'type'|'assigneeId'|'state'
  fromValue String?  @db.Text
  toValue   String?  @db.Text
  createdAt DateTime @default(now())

  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  actor  User   @relation(fields: [actorId], references: [id], onDelete: Cascade)

  @@index([ticketId])
  @@index([actorId])
}
```

- `field` se guarda como `String` (no enum Prisma) para no pagar migraciones al
  añadir campos auditables; el valor permitido se tipa en TS como union
  (`TicketAuditField`).
- `fromValue`/`toValue` en `@db.Text` para soportar `description` largas. Para
  `description` se puede optar por guardar solo un marcador `<editado>` para
  ahorrar espacio; se recomienda guardar el texto completo en v1 y revisar
  tamaño después.

### 4.3 Qué se registra y cuándo

El `TicketsService` (y el `transition`) deben, en una **transacción Prisma**
(`$transaction`):

- **Edición de campos** (`PATCH` / tomar ticket):
  - Hacer diff de `old` vs `new` para `title`, `description`, `priority`,
    `type`, `assigneeId`.
  - Por cada campo cambiado → `TicketAudit.create({ ticketId, actorId, field,
    fromValue, toValue, createdAt })`.
  - "Tomar ticket" = `assigneeId: null → userId` → se registra con
    `field='assigneeId'`, `fromValue=null`, `toValue=userId`, `actorId` = quien
    lo tomó. ✅ cubre el requisito de trazabilidad de asignación.
- **Transición de estado** (máquina de estados):
  - Se crea `TicketHistory` como hoy (con `actorId`) — **sin cambios**.
  - Para el feed unificado, `GET /tickets/:id/activity` mezcla `TicketHistory`
    (como `kind:'state'`) + `TicketAudit` (como `kind:'edit'`). No se duplica la
    escritura; la unificación es solo de lectura.
  - Opcional (no obligatorio): también escribir en `TicketAudit` con
    `field='state'` para tener una sola tabla de auditoría de cara a reportes.
    Se deja como **opcional** para no complicar la transacción de transición; la
    fuente de verdad del estado sigue siendo `TicketHistory`.

### 4.4 DTOs para el frontend

```ts
export type TicketAuditField =
  | 'title' | 'description' | 'priority' | 'type' | 'assigneeId' | 'state';

export interface TicketAuditDto {
  id: string;
  ticketId: string;
  actorId: string;
  field: TicketAuditField;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
  actor: Pick<SessionUser, 'id' | 'name'>;
}

/** Feed unificado de historial + ediciones. */
export interface TicketActivityDto {
  id: string;
  ticketId: string;
  actorId: string;
  kind: 'state' | 'edit';
  createdAt: string;
  actor: Pick<SessionUser, 'id' | 'name'>;
  // kind='state':
  fromState?: TicketStateValue;
  toState?: TicketStateValue;
  // kind='edit':
  field?: TicketAuditField;
  fromValue?: string | null;
  toValue?: string | null;
}
```

El `TicketDto` **no** se infla con el historial en el listado (rendimiento); el
feed se obtiene bajo demanda con `GET /tickets/:id/activity`.

---

## 5. Contratos API / `packages/types` (decisión 5)

### 5.1 Cambios en `packages/types/src/index.ts`

```ts
// ELIMINAR: export type ProjectRole = Role;
// NUEVO:
export type ProjectRole = 'admin' | 'supervisor' | 'operador';

export interface AddProjectMemberDto {
  userId?: string;
  email?: string;
  roleInProject: ProjectRole;
}

export interface UpdateProjectMemberDto {
  roleInProject: ProjectRole;
}

// Nuevos (ver §4.4):
export type TicketAuditField = 'title' | 'description' | 'priority' | 'type' | 'assigneeId' | 'state';
export interface TicketAuditDto { /* ... §4.4 ... */ }
export interface TicketActivityDto { /* ... §4.4 ... */ }

// ProjectMemberDto.roleInProject ya apunta al nuevo ProjectRole (sin cambio de nombre).
```

Regla de sincronización: el enum Prisma `ProjectRole` y el string-literal
`ProjectRole` de TS deben coincidir 1:1 (igual que hoy con `Role`/`TicketState`).

### 5.2 Endpoints nuevos / modificados

| Método | Ruta | Cambio | Authz (ver §7) |
|--------|------|--------|----------------|
| POST | `/projects/:id/members` | Body ahora acepta `email`/`userId` (§2). | admin proyecto / supervisor |
| PATCH | `/projects/:id/members/:userId` | **NUEVO**: cambiar rol (`UpdateProjectMemberDto`). | admin proyecto / supervisor (no a admin) |
| GET | `/tickets` | Filtro de visibilidad server-side (§3); query params existentes se combinan con `AND`. | miembro (filtrado por rol) |
| GET | `/tickets/:id/activity` | **NUEVO**: `TicketActivityDto[]` (historial+ediciones). | miembro (solo tickets visibles) |
| GET | `/tickets/:id/history` | Se mantiene para `TicketHistory` puro (estado). | miembro |

`AddProjectMemberDto` y `UpdateProjectMemberDto` se implementan en el backend
como clases con `class-validator` que `implements` los tipos de
`@ticketera/types` (patrón del `architecture.md` §7).

---

## 6. Plan de migración Prisma (decisión 6) — ⚠️ GATE

### 6.1 Diff de `schema.prisma` propuesto

```prisma
// NUEVO enum
enum ProjectRole {
  admin
  supervisor
  operador
}

model ProjectMember {
  id            String       @id @default(cuid())
  projectId     String
  userId        String
  roleInProject ProjectRole  @default(operador)   // ANTES: Role @default(usuario)
  joinedAt      DateTime     @default(now())
  // ... relaciones igual
}

// NUEVO modelo
model TicketAudit {
  id        String   @id @default(cuid())
  ticketId  String
  actorId   String
  field     String
  fromValue String?  @db.Text
  toValue   String?  @db.Text
  createdAt DateTime @default(now())
  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  actor  User   @relation(fields: [actorId], references: [id], onDelete: Cascade)
  @@index([ticketId])
  @@index([actorId])
}
```

Notas:
- El enum `Role` **no se toca** (sigue para `User.role`).
- El default de `roleInProject` pasa de `usuario` a `operador`.
- No se borra `TicketHistory`.

### 6.2 SQL de migración (para revisión)

```sql
-- 1) Crear el nuevo enum
CREATE TYPE "ProjectRole" AS ENUM ('admin', 'supervisor', 'operador');

-- 2) Cambio de tipo de ProjectMember.roleInProject (Role -> ProjectRole) con backfill seguro
ALTER TABLE "ProjectMember" ADD COLUMN "roleInProject_new" "ProjectRole" NOT NULL DEFAULT 'operador';

UPDATE "ProjectMember"
SET "roleInProject_new" =
  CASE
    WHEN "roleInProject"::text = 'admin' THEN 'admin'::"ProjectRole"
    ELSE 'operador'::"ProjectRole"   -- 'agente' y 'usuario' -> 'operador'
  END;

ALTER TABLE "ProjectMember" DROP COLUMN "roleInProject";
ALTER TABLE "ProjectMember" RENAME COLUMN "roleInProject_new" TO "roleInProject";

-- 3) Tabla TicketAudit
CREATE TABLE "TicketAudit" (
  "id"        TEXT NOT NULL,
  "ticketId"  TEXT NOT NULL,
  "actorId"   TEXT NOT NULL,
  "field"     TEXT NOT NULL,
  "fromValue" TEXT,
  "toValue"   TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "TicketAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TicketAudit_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE,
  CONSTRAINT "TicketAudit_actorId_fkey"  FOREIGN KEY ("actorId")  REFERENCES "User"("id")   ON DELETE CASCADE
);
CREATE INDEX "TicketAudit_ticketId_idx" ON "TicketAudit"("ticketId");
CREATE INDEX "TicketAudit_actorId_idx"  ON "TicketAudit"("actorId");
```

> El paso 2 usa columna temporal + backfill porque Postgres no permite
> `ALTER ... TYPE` entre enums distintos en una sola sentencia. El mapeo
> `agente`/`usuario` → `operador` es deliberado: no existe `supervisor` previo.

### 6.3 Pasos (post-aprobación)

1. **Usuario aprueba** el SQL anterior (GATE).
2. Generar la migración sin aplicar: `bunx prisma migrate dev --create-only`
   (luego revisar/ajustar el `.sql` para que coincida con §6.2, especialmente el
   backfill).
3. Aplicar en desarrollo: `bunx prisma migrate dev`.
4. Regenerar cliente: `bunx prisma generate`.
5. En producción (Neon): `bunx prisma migrate deploy` (vía CI o manual, nunca
   automático en build — ver `architecture.md` §6).
6. Verificar que `ProjectMember` existentes tienen rol coherente (el backfill ya
   lo garantiza).

### 6.4 ⛔ GATE DE APROBACIÓN (explícito)

> **NO ejecutar `prisma migrate dev` ni `prisma migrate deploy` hasta que el
> usuario confirme explícitamente este plan.** El equipo (backend) debe presentar
> el SQL de §6.2 para revisión y esperar el visto bueno. Mientras tanto, el
> `schema.prisma` puede actualizarse para `prisma generate` (tipos), pero la
> base de datos no se migra.

---

## 7. Matriz de permisos técnica (decisión 7)

Leyenda: 🔓 = `JwtAuthGuard` (autenticado). Luego, verificación en **service**:
`G` = `Role.admin` global (override), `PA` = `ProjectRole.admin`,
`S` = `ProjectRole.supervisor`, `O` = `ProjectRole.operador`,
`M` = miembro cualquiera.

| Método | Ruta | Auth (guard) | Verificación en service |
|--------|------|:---:|--------------------------|
| POST | `/projects` | 🔓 | Cualquier autenticado; el creador pasa a `PA` automáticamente. |
| GET | `/projects` | 🔓 | Devuelve proyectos donde es `M`. |
| GET | `/projects/:id` | 🔓 | `G` o `M`; si no → `403 NOT_PROJECT_MEMBER`. |
| PATCH | `/projects/:id` | 🔓 | `G` o `PA`. |
| DELETE | `/projects/:id` | 🔓 | `G` o `PA` (no `S`/`O`). |
| GET | `/projects/:id/members` | 🔓 | `G` o `M`. |
| POST | `/projects/:id/members` | 🔓 | `G` o `PA` o `S`. `S` no puede otorgar `PA` (→`403 CANNOT_GRANT_PROJECT_ADMIN`). Email inexistente → `404 USER_NOT_FOUND`. Ya miembro → `200` (idempotente). |
| PATCH | `/projects/:id/members/:userId` | 🔓 | `G` o `PA` o `S` (con restricción de rol y `409 LAST_PROJECT_ADMIN`). |
| DELETE | `/projects/:id/members/:userId` | 🔓 | `G` o `PA` o `S` (`409 LAST_PROJECT_ADMIN`). |
| POST | `/tickets` | 🔓 | `G` o `M` (en el `projectId`). |
| GET | `/tickets` | 🔓 | `G` → todos; `PA`/`S` → todos del proyecto; `O` → filtro §3.2. |
| GET | `/tickets/:id` | 🔓 | `G` → ok; si no, `M` y visible por rol (§3.2); si no → `403`. |
| PATCH | `/tickets/:id` | 🔓 | `G` → ok; si no, `M` + ticket visible + (reportero/asignado/`PA`/`S` según campo). Escribe `TicketAudit`. |
| DELETE | `/tickets/:id` | 🔓 | `G` o `PA`. |
| GET | `/tickets/:id/history` | 🔓 | `G` o `M` (ticket visible). |
| GET | `/tickets/:id/activity` | 🔓 | `G` o `M` (ticket visible). |
| GET/POST | `/tickets/:id/transitions` | 🔓 | Guarda de la máquina de estados extendida con `ProjectRole` (§8). |
| POST | `/tickets/:id/transitions` | 🔓 | Igual; además escribe `TicketHistory` (actorId). |

Todos los errores usan el formato `{ error: { code, message, details? } }` y los
`ErrorCodes` existentes. **Nuevos códigos a añadir** en
`apps/api/src/common/errors/error-codes.ts`:
`CANNOT_GRANT_PROJECT_ADMIN`, `INVITE_TARGET_AMBIGUOUS`, `LAST_PROJECT_ADMIN`.
Se reutilizan: `USER_NOT_FOUND`, `NOT_PROJECT_MEMBER`, `FORBIDDEN`,
`VALIDATION_ERROR`, `TRANSITION_NOT_ALLOWED`, etc.

---

## 8. Apéndice: integración con la máquina de estados (no romper §6 de state-machine.md)

La máquina de estados hoy usa `TransitionGuardContext { actorRole: Role, actorId,
reporterId }`. Para respetar los roles de proyecto, se **extiende** (no se
reescribe) el contexto:

```ts
export interface TransitionGuardContext {
  actorRole: Role;          // global (se mantiene)
  actorId: string;
  reporterId: string;
  projectRole?: ProjectRole; // NUEVO: rol en el proyecto del ticket
}
```

Reglas de guarda propuestas (a documentar en `state-machine.md` al implementar):
- `actorRole === 'admin'` (global) → siempre permitido (override).
- Si hay `projectRole`:
  - `admin` (proyecto) → permitido (override dentro del proyecto).
  - `supervisor` → igual que el `agente` actual (flujo normal:
    abierto→en_progreso/en_revision/cerrado, en_progreso→en_revision/abierto,
    en_revision→resuelto/en_progreso, cerrado→reabierto, reabierto→*).
  - `operador` → **limitado**: puede mover tickets que le están asignados (o que
    toma) en el camino feliz: `abierto→en_progreso` (al tomar),
    `en_progreso→en_revision`. No puede `resuelto`/`cerrado`/`reabierto`
    (eso lo hace `supervisor`/`admin`). El `reporterId` ya no es el único
    habilitado para reabrir; se sustituye por `projectRole`.
- Si no es miembro y no es `admin` global → `403 NOT_PROJECT_MEMBER` (ya cubierto
  por la verificación de visibilidad previa).

La **persistencia** de la transición no cambia: `TicketService.transition()`
sigue escribiendo `TicketHistory` (from→to, actorId) en la misma transacción. La
auditoría de estado para el feed unificado se deriva de ahí (§4.3), sin tocar la
máquina.

---

## 9. Checklist para implementadores (no exhaustivo)

- [ ] `packages/types`: nuevo `ProjectRole`, `AddProjectMemberDto` (email/userId),
      `UpdateProjectMemberDto`, `TicketAuditDto`, `TicketActivityDto`,
      `TicketAuditField`.
- [ ] `schema.prisma`: enum `ProjectRole`, `ProjectMember.roleInProject`
      → `ProjectRole @default(operador)`, modelo `TicketAudit`. **No migrar sin
      aprobación (§6.4).**
- [ ] `error-codes.ts`: añadir `CANNOT_GRANT_PROJECT_ADMIN`,
      `INVITE_TARGET_AMBIGUOUS`, `LAST_PROJECT_ADMIN`.
- [ ] `ProjectsService`: invitación por email/idempotencia/guardas de rol;
      auto-crear `PA` para el creador; `PATCH` de rol.
- [ ] `TicketPolicy`: `visibleWhere` / `canView*` (§3).
- [ ] `TicketsService`: filtro de listado por visibilidad; diff + `TicketAudit`
      en `PATCH` y "tomar ticket"; feed `activity` unificado.
- [ ] `state-machine.md`: extender `TransitionGuardContext` con `projectRole` (§8).
- [ ] `api-contract.md`: reflejar nuevos endpoints y códigos de error.
- [ ] Tests: guardas de visibilidad por rol, idempotencia de invitación,
      auditoría de edición (assignee/title/etc.), restricción supervisor→admin.
