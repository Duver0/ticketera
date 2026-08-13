import type { TicketStateValue } from '@ticketera/types';
import type { TicketState, TransitionGuardContext } from './ticket-state.interface';

/**
 * Estados concretos del ciclo de vida del ticket (Patrón State).
 * `allowedTargets` define la estructura; `canTransitionTo` aplica los guardas por
 * rol. `admin` siempre puede forzar cualquiera (state-machine.md §3/§5).
 */

class AbiertoState implements TicketState {
  readonly value: TicketStateValue = 'abierto';
  readonly allowedTargets: readonly TicketStateValue[] = ['en_progreso', 'en_revision', 'cerrado'];

  canTransitionTo(target: TicketStateValue, ctx: TransitionGuardContext): boolean {
    if (ctx.actorRole === 'admin') return true;
    if (ctx.actorRole === 'agente') return this.allowedTargets.includes(target);
    return false; // usuario no mueve 'abierto'
  }
}

class EnProgresoState implements TicketState {
  readonly value: TicketStateValue = 'en_progreso';
  readonly allowedTargets: readonly TicketStateValue[] = ['en_revision', 'abierto'];

  canTransitionTo(target: TicketStateValue, ctx: TransitionGuardContext): boolean {
    if (ctx.actorRole === 'admin') return true;
    if (ctx.actorRole === 'agente') return this.allowedTargets.includes(target);
    return false;
  }
}

class EnRevisionState implements TicketState {
  readonly value: TicketStateValue = 'en_revision';
  readonly allowedTargets: readonly TicketStateValue[] = ['resuelto', 'en_progreso'];

  canTransitionTo(target: TicketStateValue, ctx: TransitionGuardContext): boolean {
    if (ctx.actorRole === 'admin') return true;
    if (ctx.actorRole === 'agente') return this.allowedTargets.includes(target);
    return false;
  }
}

class ResueltoState implements TicketState {
  readonly value: TicketStateValue = 'resuelto';
  readonly allowedTargets: readonly TicketStateValue[] = ['cerrado', 'reabierto'];

  canTransitionTo(target: TicketStateValue, ctx: TransitionGuardContext): boolean {
    if (ctx.actorRole === 'admin') return true;
    // usuario solo si es el reportero del ticket
    if (ctx.actorRole === 'usuario') {
      return ctx.actorId === ctx.reporterId && this.allowedTargets.includes(target);
    }
    return false; // agente no mueve 'resuelto'
  }
}

class CerradoState implements TicketState {
  readonly value: TicketStateValue = 'cerrado';
  readonly allowedTargets: readonly TicketStateValue[] = ['reabierto'];

  canTransitionTo(target: TicketStateValue, ctx: TransitionGuardContext): boolean {
    if (ctx.actorRole === 'admin') return true;
    if (ctx.actorRole === 'agente') return this.allowedTargets.includes(target);
    if (ctx.actorRole === 'usuario') {
      return ctx.actorId === ctx.reporterId && this.allowedTargets.includes(target);
    }
    return false;
  }
}

class ReabiertoState implements TicketState {
  readonly value: TicketStateValue = 'reabierto';
  readonly allowedTargets: readonly TicketStateValue[] = ['en_progreso', 'abierto', 'cerrado'];

  canTransitionTo(target: TicketStateValue, ctx: TransitionGuardContext): boolean {
    if (ctx.actorRole === 'admin') return true;
    if (ctx.actorRole === 'agente') return this.allowedTargets.includes(target);
    return false;
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
