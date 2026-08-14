import { Prisma } from '@prisma/client';
import type { ProjectRole, TicketStateValue } from '@ticketera/types';

/**
 * Política de visibilidad de tickets por `ProjectRole` (ver
 * arquitectura-equipos-auditoria.md §3).
 *
 * - `admin` global: override (sin filtro) — lo resuelve el service antes de
 *   llamar a `visibleWhere`.
 * - `admin` de proyecto / `supervisor`: ven todos los tickets del proyecto
 *   (`visibleWhere` devuelve `null`).
 * - `operador`: solo `(abierto Y sin asignar) OR (assignee = yo)`. La tercera
 *   cláusula del requisito (resuelto/cerrado Y assignee = yo) está subsumida por
 *   la segunda.
 */
export class TicketPolicy {
  /** WHERE adicional para el listado; `null` = sin filtro adicional. */
  static visibleWhere(userId: string, projectRole: ProjectRole): Prisma.TicketWhereInput | null {
    if (projectRole === 'admin' || projectRole === 'supervisor') {
      return null;
    }
    // operador
    return {
      OR: [
        { AND: [{ state: 'abierto' }, { assigneeId: null }] },
        { assigneeId: userId },
      ],
    };
  }

  /** true si un ticket es visible para un operador. */
  static isOperadorVisible(ticket: {
    state: TicketStateValue;
    assigneeId: string | null;
  }, userId: string): boolean {
    if (ticket.state === 'abierto' && ticket.assigneeId === null) return true;
    if (ticket.assigneeId === userId) return true;
    return false;
  }
}
