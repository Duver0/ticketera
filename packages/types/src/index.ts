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

/** Rol dentro de la membresía de un proyecto (ProjectMember). */
export type ProjectRole = Role;

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
}

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
  userId: string;
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

export interface NotificationDto {
  id: string;
  userId: string;
  type: string;
  payload: unknown;
  read: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Tipos de utilidad
// ---------------------------------------------------------------------------

/** Usuario autenticado tal como lo inyecta el guard de la API. */
export interface RequestUser {
  id: string;
  email: string;
  role: Role;
  /** Opcionales: enriquecidos desde el JWT de Auth.js (name/picture). */
  name?: string | null;
  image?: string | null;
}
