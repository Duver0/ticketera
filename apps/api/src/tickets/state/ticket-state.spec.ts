import type { Role, TicketStateValue } from '@ticketera/types';
import { ErrorCodes, AppError } from '../../common/errors/error-codes';
import { TicketContext } from './ticket-context';
import { STATE_FACTORY } from './states';
import type { TransitionGuardContext } from './ticket-state.interface';

function guardCtx(role: Role, actorId = 'actor-1', reporterId = 'reporter-1'): TransitionGuardContext {
  return { actorRole: role, actorId, reporterId };
}

/** Afirma que fn lanza un AppError con el `code` indicado. */
function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error('Se esperaba un AppError pero no se lanzó nada');
  } catch (err) {
    if (err instanceof AppError) {
      expect(err.getResponse()).toMatchObject({ code });
      return;
    }
    throw err;
  }
}

/** Tabla de transiciones válidas (no-admin) según docs/state-machine.md §5. */
const VALID_TRANSITIONS: ReadonlyArray<{
  from: TicketStateValue;
  to: TicketStateValue;
  role: Role;
  reporterMatchesActor?: boolean;
}> = [
  { from: 'abierto', to: 'en_progreso', role: 'agente' },
  { from: 'abierto', to: 'en_revision', role: 'agente' },
  { from: 'abierto', to: 'cerrado', role: 'agente' },
  { from: 'en_progreso', to: 'en_revision', role: 'agente' },
  { from: 'en_progreso', to: 'abierto', role: 'agente' },
  { from: 'en_revision', to: 'resuelto', role: 'agente' },
  { from: 'en_revision', to: 'en_progreso', role: 'agente' },
  { from: 'resuelto', to: 'cerrado', role: 'usuario', reporterMatchesActor: true },
  { from: 'resuelto', to: 'reabierto', role: 'usuario', reporterMatchesActor: true },
  { from: 'cerrado', to: 'reabierto', role: 'agente' },
  { from: 'cerrado', to: 'reabierto', role: 'usuario', reporterMatchesActor: true },
  { from: 'reabierto', to: 'en_progreso', role: 'agente' },
  { from: 'reabierto', to: 'abierto', role: 'agente' },
  { from: 'reabierto', to: 'cerrado', role: 'agente' },
];

describe('TicketState machine', () => {
  it('admin puede forzar cualquier transición (incluidas no listadas)', () => {
    const states: TicketStateValue[] = [
      'abierto', 'en_progreso', 'en_revision', 'resuelto', 'cerrado', 'reabierto',
    ];
    for (const from of states) {
      for (const to of states) {
        if (from === to) continue;
        const ctx = new TicketContext(STATE_FACTORY[from]);
        const next = ctx.transitionTo(to, guardCtx('admin'));
        expect(next.value).toBe(to);
        expect(ctx.current).toBe(to);
      }
    }
  });

  it.each(VALID_TRANSITIONS)(
    'transición válida: %s -> %s (%s)',
    ({ from, to, role, reporterMatchesActor }) => {
      const actorId = reporterMatchesActor ? 'r1' : 'a1';
      const reporterId = 'r1';
      const ctx = new TicketContext(STATE_FACTORY[from]);
      const next = ctx.transitionTo(to, guardCtx(role, actorId, reporterId));
      expect(next.value).toBe(to);
    },
  );

  it('usuario NO puede mover "abierto" (rol_no_autorizado)', () => {
    const ctx = new TicketContext(STATE_FACTORY['abierto']);
    expectCode(() => ctx.transitionTo('en_progreso', guardCtx('usuario')), ErrorCodes.TRANSITION_NOT_ALLOWED);
  });

  it('usuario NO puede mover "resuelto" si no es el reportero', () => {
    const ctx = new TicketContext(STATE_FACTORY['resuelto']);
    expectCode(
      () => ctx.transitionTo('cerrado', guardCtx('usuario', 'otro', 'reportero')),
      ErrorCodes.TRANSITION_NOT_ALLOWED,
    );
  });

  it('agente NO puede mover "resuelto"', () => {
    const ctx = new TicketContext(STATE_FACTORY['resuelto']);
    expectCode(() => ctx.transitionTo('cerrado', guardCtx('agente')), ErrorCodes.TRANSITION_NOT_ALLOWED);
  });

  it('misma transición lanza SAME_STATE_TRANSITION (409)', () => {
    const ctx = new TicketContext(STATE_FACTORY['abierto']);
    expectCode(() => ctx.transitionTo('abierto', guardCtx('admin')), ErrorCodes.SAME_STATE_TRANSITION);
  });

  it('misma transición lanza SAME_STATE_TRANSITION para cualquier rol', () => {
    const ctx = new TicketContext(STATE_FACTORY['en_progreso']);
    expectCode(() => ctx.transitionTo('en_progreso', guardCtx('usuario')), ErrorCodes.SAME_STATE_TRANSITION);
  });

  it('optionsFor marca el estado actual con reason misma_transicion', () => {
    const ctx = new TicketContext(STATE_FACTORY['abierto']);
    const options = ctx.optionsFor(guardCtx('agente'));
    expect(options).toHaveLength(6);
    const current = options.find((o) => o.to === 'abierto');
    expect(current?.allowed).toBe(false);
    expect(current?.reason).toBe('misma_transicion');
    const allowed = options.find((o) => o.to === 'en_progreso');
    expect(allowed?.allowed).toBe(true);
    const denied = options.find((o) => o.to === 'resuelto');
    expect(denied?.allowed).toBe(false);
    expect(denied?.reason).toBe('rol_no_autorizado');
  });

  it('optionsFor para usuario reportero en "resuelto" permite cerrado/reabierto', () => {
    const ctx = new TicketContext(STATE_FACTORY['resuelto']);
    const options = ctx.optionsFor(guardCtx('usuario', 'r1', 'r1'));
    const cerrado = options.find((o) => o.to === 'cerrado');
    const reabierto = options.find((o) => o.to === 'reabierto');
    expect(cerrado?.allowed).toBe(true);
    expect(reabierto?.allowed).toBe(true);
    const enProgreso = options.find((o) => o.to === 'en_progreso');
    expect(enProgreso?.allowed).toBe(false);
  });
});
