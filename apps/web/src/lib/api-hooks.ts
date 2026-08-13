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
  CommentDto,
  CreateCommentDto,
  LabelDto,
  CreateTicketDto,
  NotificationDto,
  Priority,
  ProjectDto,
  ProjectMemberDto,
  Role,
  SessionUser,
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

