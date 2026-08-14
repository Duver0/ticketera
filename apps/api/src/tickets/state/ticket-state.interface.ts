import type { ProjectRole, Role, TicketStateValue, TransitionOptionDto } from '@ticketera/types';

/**
 * Contexto de guarda para evaluar si un actor puede transicionar.
 * `actorRole` es el rol GLOBAL del usuario (admin/agente/usuario), cargado desde
 * la DB por el guard. `projectRole` es el rol POR PROYECTO (admin/supervisor/
 * operador) resuelto vía ProjectMember; es la fuente de autorización fina dentro
 * del proyecto (ver arquitectura-equipos-auditoria.md §8). `reporterId` es el
 * creador del ticket.
 */
export interface TransitionGuardContext {
  actorRole: Role;
  actorId: string;
  reporterId: string;
  projectRole?: ProjectRole;
}

/**
 * Interfaz de Estado (Patrón State).
 * Cada estado concreto implementa `canTransitionTo`, aplicando los guardas por rol.
 * `admin` siempre puede forzar cualquier transición (ver state-machine.md).
 */
export interface TicketState {
  readonly value: TicketStateValue;
  /** Estados destino estructuralmente permitidos (sin considerar rol). */
  readonly allowedTargets: readonly TicketStateValue[];
  canTransitionTo(target: TicketStateValue, ctx: TransitionGuardContext): boolean;
}

export type { TransitionOptionDto };
