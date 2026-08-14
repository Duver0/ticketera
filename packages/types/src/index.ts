/**
 * Contratos compartidos entre la API (NestJS) y el Web (Next.js).
 * Identificadores en inglés; comentarios/diseño en español cuando aplique.
 * Este archivo es la única fuente de verdad de tipos de dominio y DTOs.
 * No usar `any`.
 */

// ---------------------------------------------------------------------------
// Enums como string-literals (deben coincidir 1:1 con los enums de Prisma)
// ---------------------------------------------------------------------------

export type Role = 'admin' | 'agente' | 'usuario';

export type TicketStateValue =
  | 'abierto'
  | 'en_progreso'
  | 'en_revision'
  | 'resuelto'
  | 'cerrado'
  | 'reabierto';

export type Priority = 'baja' | 'media' | 'alta' | 'urgente';

export type TicketType = 'bug' | 'feature' | 'tarea' | 'epic';

/**
 * Rol dentro de la membresía de un proyecto (ProjectMember). Es ortogonal al
 * `Role` global: `admin` (dueño del proyecto), `supervisor` (gestiona equipo y
 * ve/edita todos los tickets), `operador` (trabajador con visibilidad restringida).
 * Debe coincidir 1:1 con el enum `ProjectRole` de Prisma.
 */
export type ProjectRole = 'admin' | 'supervisor' | 'operador';

// ---------------------------------------------------------------------------
// Envoltura de respuesta y error (formato estable de la API)
// ---------------------------------------------------------------------------

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ApiSuccess<T> {
  data: T;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ---------------------------------------------------------------------------
// Sesión / Auth
// ---------------------------------------------------------------------------

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  role: Role;
  /** Organización del usuario (null si es org-less). */
  organizationId?: string | null;
}

// ---------------------------------------------------------------------------
// Auth: credenciales (email + contraseña)
// ---------------------------------------------------------------------------

export interface RegisterDto {
  name: string; // 1..100 chars
  email: string; // email válido
  password: string; // >=8 chars, al menos una letra y un dígito
  /**
   * (a) CREAR organización con este slug (queda dueño). Mutuamente excluyente
   * con `inviteCode`. Si ninguno viene, el usuario queda sin org (org-less).
   */
  organizationSlug?: string;
  /** (b) UNIRSE a una organización existente por su código de invitación. */
  inviteCode?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

// Respuesta de /auth/login y /auth/register (envuelta en { data }):
//   LoginResponse = SessionUser
export type LoginResponse = SessionUser;
export type RegisterResponse = SessionUser;

// ---------------------------------------------------------------------------
// DTOs de entrada (request bodies)
// ---------------------------------------------------------------------------

export interface CreateProjectDto {
  key: string;
  name: string;
  description?: string;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string;
}

export interface AddProjectMemberDto {
  /** Exactamente uno de `userId`/`email` es requerido. */
  userId?: string;
  email?: string;
  roleInProject: ProjectRole;
}

export interface UpdateProjectMemberDto {
  roleInProject: ProjectRole;
}

export interface CreateTicketDto {
  projectId: string;
  title: string;
  description?: string;
  priority?: Priority;
  type?: TicketType;
  assigneeId?: string;
  labelIds?: string[];
}

export interface UpdateTicketDto {
  title?: string;
  description?: string;
  priority?: Priority;
  type?: TicketType;
  assigneeId?: string | null;
}

export interface TransitionTicketDto {
  to: TicketStateValue;
  comment?: string;
}

export interface CreateCommentDto {
  body: string;
}

export interface CreateLabelDto {
  name: string;
  color?: string;
}

export interface CreateAttachmentDto {
  filename: string;
  url: string;
  size?: number;
  mimeType?: string;
}

// ---------------------------------------------------------------------------
// Modelos de lectura (responses)
// ---------------------------------------------------------------------------

export interface ProjectDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  createdById: string;
  createdAt: string;
}

export interface ProjectMemberDto {
  id: string;
  projectId: string;
  userId: string;
  roleInProject: ProjectRole;
  user: Pick<SessionUser, 'id' | 'name' | 'email' | 'image'>;
}

export interface TicketDto {
  id: string;
  key: string; // p.ej. SUP-12
  projectId: string;
  title: string;
  description: string | null;
  state: TicketStateValue;
  priority: Priority;
  type: TicketType;
  reporterId: string;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommentDto {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  createdAt: string;
  author: Pick<SessionUser, 'id' | 'name' | 'image'>;
}

export interface LabelDto {
  id: string;
  projectId: string;
  name: string;
  color: string | null;
}

export interface AttachmentDto {
  id: string;
  ticketId: string;
  uploadedById: string;
  filename: string;
  url: string;
  size: number | null;
  mimeType: string | null;
  createdAt: string;
}

export interface TicketHistoryDto {
  id: string;
  ticketId: string;
  actorId: string;
  fromState: TicketStateValue;
  toState: TicketStateValue;
  createdAt: string;
  actor: Pick<SessionUser, 'id' | 'name'>;
}

/** Opción de transición devuelta por GET /tickets/:id/transitions. */
export interface TransitionOptionDto {
  to: TicketStateValue;
  allowed: boolean;
  reason?: string; // p.ej. "rol_no_autorizado" | "misma_transicion"
}

// ---------------------------------------------------------------------------
// Auditoría de tickets (ediciones de campos) + feed unificado de actividad
// ---------------------------------------------------------------------------

/** Campo del ticket cuyo cambio se registra en `TicketAudit`. */
export type TicketAuditField =
  | 'title'
  | 'description'
  | 'priority'
  | 'type'
  | 'assigneeId'
  | 'state';

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

/** Feed unificado de historial de estado + ediciones de campos. */
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

export interface NotificationDto {
  id: string;
  userId: string;
  type: string;
  payload: unknown;
  read: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Organizaciones (Organization) + alcance por org
// ---------------------------------------------------------------------------

export interface OrganizationDto {
  id: string;
  slug: string;
  ownerId: string;
  createdAt: string; // ISO
  memberCount: number;
  /** Solo se incluye si el actor es dueño de la org o admin global. */
  inviteCode?: string;
}

export interface CreateOrganizationDto {
  /** Regex ^[a-z0-9]+(?:-[a-z0-9]+)*$, longitud 3..40. */
  slug: string;
  /** Solo admin global; si se omite, el actor queda como dueño. */
  ownerId?: string;
}

export interface JoinOrganizationDto {
  inviteCode: string;
}

export interface RotateInviteCodeResponseDto {
  inviteCode: string; // nuevo código regenerado
}

export interface OrganizationMemberDto {
  id: string;
  name: string | null;
  email: string;
  role: Role; // Role global, no ProjectRole
  joinedAt: string; // ISO (proxy: User.createdAt)
}

// ---------------------------------------------------------------------------
// Tipos de utilidad
// ---------------------------------------------------------------------------

/** Usuario autenticado tal como lo inyecta el guard de la API. */
export interface RequestUser {
  id: string;
  email: string;
  role: Role;
  /** Organización del usuario (null si es org-less). */
  organizationId?: string | null;
  /** Opcionales: enriquecidos desde el JWT de Auth.js (name/picture). */
  name?: string | null;
  image?: string | null;
}
