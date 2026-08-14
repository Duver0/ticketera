'use client';

import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {api} from '@/lib/api';
import type {
  AddProjectMemberDto,
  CommentDto,
  CreateCommentDto,
  CreateOrganizationDto,
  CreateProjectDto,
  JoinOrganizationDto,
  LabelDto,
  CreateTicketDto,
  NotificationDto,
  OrganizationDto,
  OrganizationMemberDto,
  Priority,
  ProjectDto,
  ProjectMemberDto,
  ProjectRole,
  Role,
  RotateInviteCodeResponseDto,
  SessionUser,
  TicketActivityDto,
  TicketDto,
  TicketStateValue,
  TicketType,
  TransitionOptionDto,
  TransitionTicketDto,
  UpdateTicketDto,
} from '@ticketera/types';

// ---------------------------------------------------------------------------
// Filtros de tickets (query params soportados por GET /tickets)
// ---------------------------------------------------------------------------
export interface TicketFilters {
  projectId?: string;
  state?: TicketStateValue;
  assigneeId?: string;
  reporterId?: string;
  priority?: Priority;
  type?: TicketType;
  labelId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

function buildQuery(filters?: TicketFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  const entries: [keyof TicketFilters, string | undefined][] = [
    ['projectId', filters.projectId],
    ['state', filters.state],
    ['assigneeId', filters.assigneeId],
    ['reporterId', filters.reporterId],
    ['priority', filters.priority],
    ['type', filters.type],
    ['labelId', filters.labelId],
    ['q', filters.q],
    ['page', filters.page?.toString()],
    ['pageSize', filters.pageSize?.toString()],
  ];
  for (const [k, v] of entries) {
    if (v) params.set(k, v);
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

// ---------------------------------------------------------------------------
// Proyectos / membresías
// ---------------------------------------------------------------------------
export function useProjects() {
  return useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: () => api.get<ProjectDto[]>('/projects'),
  });
}

/** Crea un proyecto. El usuario autenticado queda como admin (lo maneja el API). */
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProjectDto) => api.post<ProjectDto>('/projects', body),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: ['projects']});
    },
  });
}

export function useProjectLabelsFor(projectId: string | undefined) {
  return useQuery<LabelDto[]>({
    queryKey: ['project-labels', projectId],
    queryFn: () => api.get<LabelDto[]>(`/projects/${projectId}/labels`),
    enabled: Boolean(projectId),
  });
}

export function useProjectMembers(projectId: string | undefined) {
  return useQuery<ProjectMemberDto[]>({
    queryKey: ['project-members', projectId],
    queryFn: () => api.get<ProjectMemberDto[]>(`/projects/${projectId}/members`),
    enabled: Boolean(projectId),
  });
}

/** Detalle de un proyecto (404/403 si no eres miembro). */
export function useProject(id: string | undefined) {
  return useQuery<ProjectDto>({
    queryKey: ['project', id],
    queryFn: () => api.get<ProjectDto>(`/projects/${id}`),
    enabled: Boolean(id),
  });
}

/** Añade un miembro al proyecto (userId|email + rol). Invalida miembros y candidatos. */
export function useAddProjectMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddProjectMemberDto) =>
      api.post<ProjectMemberDto>(`/projects/${projectId}/members`, body),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: ['project-members', projectId]});
      qc.invalidateQueries({queryKey: ['project-candidates', projectId]});
    },
  });
}

/** Cambia el rol de un miembro del proyecto. */
export function useUpdateProjectMemberRole(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({userId, roleInProject}: {userId: string; roleInProject: ProjectRole}) =>
      api.patch<ProjectMemberDto>(`/projects/${projectId}/members/${userId}`, {roleInProject}),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: ['project-members', projectId]});
    },
  });
}

/** Quita un miembro del proyecto. */
export function useRemoveProjectMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.delete<void>(`/projects/${projectId}/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: ['project-members', projectId]});
      qc.invalidateQueries({queryKey: ['project-candidates', projectId]});
    },
  });
}

/**
 * Candidatos para invitar: usuarios de la MISMA org del proyecto que aún no son
 * miembros. El backend ya filtra por org, así que nunca sugerirá de otra org.
 */
export function useProjectCandidates(projectId: string | undefined, q: string) {
  return useQuery<OrganizationMemberDto[]>({
    queryKey: ['project-candidates', projectId, q],
    queryFn: () =>
      api.get<OrganizationMemberDto[]>(
        `/projects/${projectId}/candidates?q=${encodeURIComponent(q)}`,
      ),
    enabled: Boolean(projectId) && q.trim().length > 0,
  });
}

// ---------------------------------------------------------------------------
// Organizaciones
// ---------------------------------------------------------------------------

/** GET /organizations/me — la org del usuario (404 ORG_NOT_FOUND si es org-less). */
export function useOrganization() {
  return useQuery<OrganizationDto>({
    queryKey: ['organization'],
    queryFn: () => api.get<OrganizationDto>('/organizations/me'),
  });
}

/** GET /organizations/me/members — miembros de la org del usuario. */
export function useOrganizationMembers() {
  return useQuery<OrganizationMemberDto[]>({
    queryKey: ['organization-members'],
    queryFn: () => api.get<OrganizationMemberDto[]>('/organizations/me/members'),
  });
}

/** POST /organizations — crea una org y el actor queda dueño. */
export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOrganizationDto) =>
      api.post<OrganizationDto>('/organizations', body),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: ['organization']});
      qc.invalidateQueries({queryKey: ['organization-members']});
    },
  });
}

/** POST /organizations/join — une al actor por código de invitación. */
export function useJoinOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: JoinOrganizationDto) =>
      api.post<OrganizationDto>('/organizations/join', body),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: ['organization']});
      qc.invalidateQueries({queryKey: ['organization-members']});
    },
  });
}

/** POST /organizations/invite-code/rotate — regenera el código (dueño/admin global). */
export function useRotateInviteCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<RotateInviteCodeResponseDto>('/organizations/invite-code/rotate'),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: ['organization']});
    },
  });
}

// ---------------------------------------------------------------------------
// Actividad de tickets (feed unificado: historial de estado + auditoría)
// ---------------------------------------------------------------------------

/** GET /tickets/:id/activity — unifica TicketHistory (kind='state') + TicketAudit (kind='edit'). */
export function useTicketActivity(ticketId: string | undefined) {
  return useQuery<TicketActivityDto[]>({
    queryKey: ['ticket-activity', ticketId],
    queryFn: () => api.get<TicketActivityDto[]>(`/tickets/${ticketId}/activity`),
    enabled: Boolean(ticketId),
  });
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------
export function useTickets(filters?: TicketFilters) {
  return useQuery<TicketDto[]>({
    queryKey: ['tickets', filters ?? {}],
    queryFn: () => api.get<TicketDto[]>(`/tickets${buildQuery(filters)}`),
  });
}

export function useTicket(id: string | undefined) {
  return useQuery<TicketDto>({
    queryKey: ['ticket', id],
    queryFn: () => api.get<TicketDto>(`/tickets/${id}`),
    enabled: Boolean(id),
  });
}

export function useTicketTransitions(id: string | undefined) {
  return useQuery<TransitionOptionDto[]>({
    queryKey: ['transitions', id],
    queryFn: () => api.get<TransitionOptionDto[]>(`/tickets/${id}/transitions`),
    enabled: Boolean(id),
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTicketDto) => api.post<TicketDto>('/tickets', body),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: ['tickets']});
      qc.invalidateQueries({queryKey: ['projects']});
    },
  });
}

export function useUpdateTicket(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateTicketDto) => api.patch<TicketDto>(`/tickets/${id}`, body),
    onSuccess: (data) => {
      qc.setQueryData(['ticket', id], data);
      qc.invalidateQueries({queryKey: ['tickets']});
    },
  });
}

export function useDeleteTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/tickets/${id}`),
    onSuccess: () => qc.invalidateQueries({queryKey: ['tickets']}),
  });
}

export function useTransitionTicket(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TransitionTicketDto) =>
      api.post<TicketDto>(`/tickets/${id}/transitions`, body),
    onSuccess: (data) => {
      qc.setQueryData(['ticket', id], data);
      qc.invalidateQueries({queryKey: ['tickets']});
      qc.invalidateQueries({queryKey: ['transitions', id]});
      qc.invalidateQueries({queryKey: ['ticket-history', id]});
    },
  });
}

// ---------------------------------------------------------------------------
// Comentarios
// ---------------------------------------------------------------------------
export function useComments(ticketId: string | undefined) {
  return useQuery<CommentDto[]>({
    queryKey: ['comments', ticketId],
    queryFn: () => api.get<CommentDto[]>(`/tickets/${ticketId}/comments`),
    enabled: Boolean(ticketId),
  });
}

export function useAddComment(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCommentDto) =>
      api.post<CommentDto>(`/tickets/${ticketId}/comments`, body),
    onSuccess: () => qc.invalidateQueries({queryKey: ['comments', ticketId]}),
  });
}

export function useDeleteComment(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api.delete<void>(`/tickets/${ticketId}/comments/${commentId}`),
    onSuccess: () => qc.invalidateQueries({queryKey: ['comments', ticketId]}),
  });
}

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------
export interface TicketHistoryWithActor {
  id: string;
  ticketId: string;
  actorId: string;
  fromState: TicketStateValue;
  toState: TicketStateValue;
  createdAt: string;
  actor: {id: string; name?: string | null};
}

export function useTicketHistory(ticketId: string | undefined) {
  return useQuery<TicketHistoryWithActor[]>({
    queryKey: ['ticket-history', ticketId],
    queryFn: () => api.get<TicketHistoryWithActor[]>(`/tickets/${ticketId}/history`),
    enabled: Boolean(ticketId),
  });
}

// ---------------------------------------------------------------------------
// Notificaciones
// ---------------------------------------------------------------------------
export function useNotifications() {
  return useQuery<NotificationDto[]>({
    queryKey: ['notifications'],
    queryFn: () => api.get<NotificationDto[]>('/notifications'),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<NotificationDto>(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({queryKey: ['notifications']}),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({queryKey: ['notifications']}),
  });
}

// ---------------------------------------------------------------------------
// Usuarios (admin)
// ---------------------------------------------------------------------------
export function useUsers() {
  return useQuery<SessionUser[]>({
    queryKey: ['users'],
    queryFn: () => api.get<SessionUser[]>('/users'),
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({id, role}: {id: string; role: Role}) =>
      api.patch<SessionUser>(`/users/${id}/role`, {role}),
    onSuccess: () => qc.invalidateQueries({queryKey: ['users']}),
  });
}

export type {QueryClient};

/** Obtiene las transiciones permitidas de varios tickets en paralelo (tablero). */
export function useManyTransitions(ids: string[]) {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['transitions', id],
      queryFn: () => api.get<TransitionOptionDto[]>(`/tickets/${id}/transitions`),
      enabled: ids.length > 0,
    })),
  });
  const map = new Map<string, TicketStateValue[]>();
  ids.forEach((id, i) => {
    const data = results[i]?.data;
    if (data) map.set(id, data.filter((t) => t.allowed).map((t) => t.to));
  });
  return {map, isLoading: results.some((r) => r.isLoading)};
}

