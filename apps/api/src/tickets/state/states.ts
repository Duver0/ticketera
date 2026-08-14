import type { TicketStateValue } from '@ticketera/types';
import type { TicketState, TransitionGuardContext } from './ticket-state.interface';

/**
 * Estados concretos del ciclo de vida del ticket (Patrón State).
 * `allowedTargets` define la estructura; `canTransitionTo` aplica los guardas por
 * rol. El `admin` global siempre puede forzar cualquiera. El `admin` de proyecto
 * también (override intra-proyecto). `supervisor` se comporta como el `agente`
 * histórico; `operador` tiene transiciones limitadas (tomar ticket + avanzar a
 * revisión). Ver arquitectura-equipos-auditoria.md §8.
 */

/** Transiciones permitidas para un `operador` (camino feliz restringido). */
function operadorAllowed(current: TicketStateValue, target: TicketStateValue): boolean {
  if (current === 'abierto' && target === 'en_progreso') return true; // "tomar ticket"
  if (current === 'en_progreso' && target === 'en_revision') return true;
  return false;
}

/**
 * Resolución de permiso combinando rol global y rol de proyecto.
 * `allowed` es la lista estructural (la que antes correspondía al `agente`).
 */
function roleAllows(
  current: TicketStateValue,
  target: TicketStateValue,
  allowed: readonly TicketStateValue[],
  ctx: TransitionGuardContext,
): boolean {
  // Override total: admin global.
  if (ctx.actorRole === 'admin') return true;
  // Override intra-proyecto: admin de proyecto.
  if (ctx.projectRole === 'admin') return true;
  // Supervisor: flujo normal (igual que el agente histórico).
  if (ctx.projectRole === 'supervisor') return allowed.includes(target);
  // Operador: solo su camino feliz restringido.
  if (ctx.projectRole === 'operador') return operadorAllowed(current, target);
  // Fallback por rol global (sin projectRole resuelto): mantiene semántica previa.
  if (ctx.actorRole === 'agente') return allowed.includes(target);
  if (ctx.actorRole === 'usuario') {
    if (!ctx.reporterId || ctx.actorId !== ctx.reporterId) return false;
    if (current === 'resuelto' && target === 'reabierto') return true;
    if (current === 'cerrado' && target === 'reabierto') return true;
    return false;
  }
  return false;
}

class AbiertoState implements TicketState {
  readonly value: TicketStateValue = 'abierto';
  readonly allowedTargets: readonly TicketStateValue[] = ['en_progreso', 'en_revision', 'cerrado'];

  canTransitionTo(target: TicketStateValue, ctx: TransitionGuardContext): boolean {
    return roleAllows(this.value, target, this.allowedTargets, ctx);
  }
}

class EnProgresoState implements TicketState {
  readonly value: TicketStateValue = 'en_progreso';
  readonly allowedTargets: readonly TicketStateValue[] = ['en_revision', 'abierto'];

  canTransitionTo(target: TicketStateValue, ctx: TransitionGuardContext): boolean {
    return roleAllows(this.value, target, this.allowedTargets, ctx);
  }
}

class EnRevisionState implements TicketState {
  readonly value: TicketStateValue = 'en_revision';
  readonly allowedTargets: readonly TicketStateValue[] = ['resuelto', 'en_progreso'];

  canTransitionTo(target: TicketStateValue, ctx: TransitionGuardContext): boolean {
    return roleAllows(this.value, target, this.allowedTargets, ctx);
  }
}

class ResueltoState implements TicketState {
  readonly value: TicketStateValue = 'resuelto';
  readonly allowedTargets: readonly TicketStateValue[] = ['cerrado', 'reabierto'];

  canTransitionTo(target: TicketStateValue, ctx: TransitionGuardContext): boolean {
    return roleAllows(this.value, target, this.allowedTargets, ctx);
  }
}

class CerradoState implements TicketState {
  readonly value: TicketStateValue = 'cerrado';
  readonly allowedTargets: readonly TicketStateValue[] = ['reabierto'];

  canTransitionTo(target: TicketStateValue, ctx: TransitionGuardContext): boolean {
    return roleAllows(this.value, target, this.allowedTargets, ctx);
  }
}

class ReabiertoState implements TicketState {
  readonly value: TicketStateValue = 'reabierto';
  readonly allowedTargets: readonly TicketStateValue[] = ['en_progreso', 'abierto', 'cerrado'];

  canTransitionTo(target: TicketStateValue, ctx: TransitionGuardContext): boolean {
    return roleAllows(this.value, target, this.allowedTargets, ctx);
  }
}

/** Mapa estado -> instancia concreta (singletons). */
export const STATE_FACTORY: Record<TicketStateValue, TicketState> = {
  abierto: new AbiertoState(),
  en_progreso: new EnProgresoState(),
  en_revision: new EnRevisionState(),
  resuelto: new ResueltoState(),
  cerrado: new CerradoState(),
  reabierto: new ReabiertoState(),
};
