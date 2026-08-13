import type { Role, TicketStateValue, TransitionOptionDto } from '@ticketera/types';

/**
 * Contexto de guarda para evaluar si un actor puede transicionar.
 * `actorRole` es el rol GLOBAL del usuario (admin/agente/usuario), cargado desde
 * la DB por el guard. `reporterId` es el creador del ticket.
 */
export interface TransitionGuardContext {
  actorRole: Role;
  actorId: string;
  reporterId: string;
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
