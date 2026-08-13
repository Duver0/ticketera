import type { TicketStateValue, TransitionOptionDto } from '@ticketera/types';
import { AppError, ErrorCodes } from '../../common/errors/error-codes';
import type { TicketState, TransitionGuardContext } from './ticket-state.interface';
import { STATE_FACTORY } from './states';

/**
 * TicketContext (orquestador del Patrón State).
 *
 * Mantiene el estado actual y delega la validación al estado concreto. No conoce
 * la lógica de cada estado; solo aplica `canTransitionTo`. La persistencia
 * (Ticket + TicketHistory) la hace el service en una transacción Prisma.
 */
export class TicketContext {
  private state: TicketState;

  constructor(initial: TicketState) {
    this.state = initial;
  }

  get current(): TicketStateValue {
    return this.state.value;
  }

  /**
   * Devuelve todas las transiciones posibles desde el estado actual, marcando
   * `allowed` y `reason` cuando no lo está (para que el frontend pinte solo las
   * válidas). Incluye el estado actual como `allowed:false` con reason
   * `misma_transicion`.
   */
  optionsFor(ctx: TransitionGuardContext): TransitionOptionDto[] {
    return (Object.values(STATE_FACTORY) as TicketState[]).map((s) => {
      const target = s.value;
      if (target === this.state.value) {
        return { to: target, allowed: false, reason: 'misma_transicion' };
      }
      const allowed = this.state.canTransitionTo(target, ctx);
      return {
        to: target,
        allowed,
        reason: allowed ? undefined : 'rol_no_autorizado',
      };
    });
  }

  /**
   * Ejecuta la transición validada. Lanza AppError si no es válida.
   * Retorna el nuevo estado concreto.
   */
  transitionTo(target: TicketStateValue, ctx: TransitionGuardContext): TicketState {
    if (target === this.state.value) {
      throw new AppError(
        ErrorCodes.SAME_STATE_TRANSITION,
        'El ticket ya se encuentra en ese estado',
        409,
      );
    }
    if (!this.state.canTransitionTo(target, ctx)) {
      throw new AppError(
        ErrorCodes.TRANSITION_NOT_ALLOWED,
        'Rol no autorizado para realizar esta transición',
        403,
      );
    }
    const next = STATE_FACTORY[target];
    if (!next) {
      throw new AppError(ErrorCodes.INVALID_TRANSITION, 'Transición inválida', 400);
    }
    this.state = next;
    return this.state;
  }
}
