import { Injectable } from '@nestjs/common';
import type {
  RequestUser,
  TicketDto,
  TicketHistoryDto,
  TicketStateValue,
  TransitionOptionDto,
} from '@ticketera/types';
import { Prisma, TicketState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError, ErrorCodes } from '../common/errors/error-codes';
import { NotificationsService } from '../notifications/notifications.service';
import { TicketContext } from './state/ticket-context';
import { STATE_FACTORY } from './state/states';
import type { TransitionGuardContext } from './state/ticket-state.interface';
import {
  CreateTicketDto,
  TicketQueryDto,
  TransitionTicketDto,
  UpdateTicketDto,
} from './dto/tickets.dto';

function toTicketDto(row: {
  id: string;
  key: string;
  projectId: string;
  title: string;
  description: string | null;
  state: TicketState;
  priority: TicketDto['priority'];
  type: TicketDto['type'];
  reporterId: string;
  assigneeId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): TicketDto {
  return {
    id: row.id,
    key: row.key,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    state: row.state,
    priority: row.priority,
    type: row.type,
    reporterId: row.reporterId,
    assigneeId: row.assigneeId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toHistoryDto(row: {
  id: string;
  ticketId: string;
  actorId: string;
  fromState: TicketState;
  toState: TicketState;
  createdAt: Date;
  actor: { id: string; name: string | null };
}): TicketHistoryDto {
  return {
    id: row.id,
    ticketId: row.ticketId,
    actorId: row.actorId,
    fromState: row.fromState,
    toState: row.toState,
    createdAt: row.createdAt.toISOString(),
    actor: { id: row.actor.id, name: row.actor.name },
  };
}

/**
 * Lógica de tickets: creación con código correlativo, listado filtrado,
 * edición con autorización fina, transiciones de estado (Patrón State) y
 * generación de notificaciones.
 */
@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async ensureMember(projectId: string, userId: string): Promise<void> {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) {
      throw new AppError(
        ErrorCodes.NOT_PROJECT_MEMBER,
        'No eres miembro de este proyecto',
        403,
      );
    }
  }

  /** true si el actor puede editar/asignar el ticket. */
  private async canEdit(
    ticket: { projectId: string; reporterId: string; assigneeId: string | null },
    user: RequestUser,
  ): Promise<boolean> {
    if (user.role === 'admin') return true;
    if (ticket.reporterId === user.id) return true;
    if (ticket.assigneeId === user.id) return true;
    if (user.role === 'agente') {
      const member = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: ticket.projectId, userId: user.id } },
      });
      if (member) return true;
    }
    const pm = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: ticket.projectId, userId: user.id } },
    });
    return pm?.roleInProject === 'admin';
  }

  /** POST /tickets — crea ticket en estado `abierto`. */
  async create(dto: CreateTicketDto, user: RequestUser): Promise<TicketDto> {
    await this.ensureMember(dto.projectId, user.id);

    if (dto.assigneeId) {
      const assignee = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: dto.projectId, userId: dto.assigneeId } },
      });
      if (!assignee) {
        throw new AppError(
          ErrorCodes.ASSIGNEE_NOT_MEMBER,
          'El asignado debe ser miembro del proyecto',
          409,
        );
      }
    }

    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
      select: { key: true },
    });
    if (!project) {
      throw new AppError(ErrorCodes.PROJECT_NOT_FOUND, 'Proyecto no encontrado', 404);
    }

    const agg = await this.prisma.ticket.aggregate({
      where: { projectId: dto.projectId },
      _max: { number: true },
    });
    const number = (agg._max.number ?? 0) + 1;
    const key = `${project.key}-${number}`;

    const ticket = await this.prisma.ticket.create({
      data: {
        projectId: dto.projectId,
        number,
        key,
        title: dto.title,
        description: dto.description,
        priority: dto.priority ?? 'media',
        type: dto.type ?? 'tarea',
        reporterId: user.id,
        assigneeId: dto.assigneeId ?? null,
      },
    });

    // El id del ticket es autogenerado: conectamos las etiquetas tras crearlo.
    if (dto.labelIds?.length) {
      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          labels: {
            connect: dto.labelIds.map((id) => ({
              ticketId_labelId: { ticketId: ticket.id, labelId: id },
            })),
          },
        },
      });
    }

    if (dto.assigneeId) {
      await this.notifications.notify(dto.assigneeId, 'TICKET_ASSIGNED', {
        ticketId: ticket.id,
        key: ticket.key,
      });
    }

    return toTicketDto(ticket);
  }

  /** GET /tickets — listado filtrado + paginación (requiere membresía). */
  async findAll(query: TicketQueryDto, user: RequestUser): Promise<TicketDto[]> {
    await this.ensureMember(query.projectId, user.id);

    const where: Prisma.TicketWhereInput = {
      projectId: query.projectId,
      ...(query.state ? { state: query.state } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.reporterId ? { reporterId: query.reporterId } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.labelId
        ? { labels: { some: { labelId: query.labelId } } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const rows = await this.prisma.ticket.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toTicketDto);
  }

  /** GET /tickets/:id — detalle (requiere membresía). */
  async findOne(id: string, user: RequestUser): Promise<TicketDto> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      throw new AppError(ErrorCodes.TICKET_NOT_FOUND, 'Ticket no encontrado', 404);
    }
    await this.ensureMember(ticket.projectId, user.id);
    return toTicketDto(ticket);
  }

  /** PATCH /tickets/:id — edita campos (autorización fina). */
  async update(id: string, user: RequestUser, dto: UpdateTicketDto): Promise<TicketDto> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      throw new AppError(ErrorCodes.TICKET_NOT_FOUND, 'Ticket no encontrado', 404);
    }
    await this.ensureMember(ticket.projectId, user.id);

    if (!(await this.canEdit(ticket, user))) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'No autorizado para editar este ticket', 403);
    }

    if (dto.assigneeId !== undefined && dto.assigneeId !== null) {
      const assignee = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: ticket.projectId, userId: dto.assigneeId } },
      });
      if (!assignee) {
        throw new AppError(
          ErrorCodes.ASSIGNEE_NOT_MEMBER,
          'El asignado debe ser miembro del proyecto',
          409,
        );
      }
    }

    const previousAssignee = ticket.assigneeId;
    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        type: dto.type,
        assigneeId: dto.assigneeId === undefined ? undefined : dto.assigneeId,
      },
    });

    if (dto.assigneeId && dto.assigneeId !== previousAssignee) {
      await this.notifications.notify(dto.assigneeId, 'TICKET_ASSIGNED', {
        ticketId: updated.id,
        key: updated.key,
      });
    }

    return toTicketDto(updated);
  }

  /** DELETE /tickets/:id — solo admin de proyecto o global. */
  async remove(id: string, user: RequestUser): Promise<void> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      throw new AppError(ErrorCodes.TICKET_NOT_FOUND, 'Ticket no encontrado', 404);
    }
    await this.ensureMember(ticket.projectId, user.id);
    if (user.role !== 'admin') {
      const pm = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: ticket.projectId, userId: user.id } },
      });
      if (pm?.roleInProject !== 'admin') {
        throw new AppError(ErrorCodes.FORBIDDEN, 'Solo un admin de proyecto puede eliminar', 403);
      }
    }
    await this.prisma.ticket.delete({ where: { id } });
  }

  /**
   * POST /tickets/:id/transitions — aplica la máquina de estados.
   * Persiste Ticket + TicketHistory en una transacción y notifica.
   */
  async transition(
    id: string,
    to: TicketStateValue,
    user: RequestUser,
    comment?: string,
  ): Promise<TicketDto> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      throw new AppError(ErrorCodes.TICKET_NOT_FOUND, 'Ticket no encontrado', 404);
    }
    await this.ensureMember(ticket.projectId, user.id);

    const guardCtx: TransitionGuardContext = {
      actorRole: user.role,
      actorId: user.id,
      reporterId: ticket.reporterId,
    };
    const context = new TicketContext(STATE_FACTORY[ticket.state]);
    context.transitionTo(to, guardCtx); // lanza si no es válida

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.ticket.update({
        where: { id },
        data: { state: to },
      });
      await tx.ticketHistory.create({
        data: {
          ticketId: id,
          actorId: user.id,
          fromState: ticket.state,
          toState: to,
        },
      });
      return updated;
    });

    // Notificar a reportero y asignado (excepto al actor).
    if (ticket.reporterId !== user.id) {
      await this.notifications.notify(ticket.reporterId, 'TICKET_TRANSITION', {
        ticketId: ticket.id,
        key: ticket.key,
        from: ticket.state,
        to,
        comment,
      });
    }
    if (ticket.assigneeId && ticket.assigneeId !== user.id) {
      await this.notifications.notify(ticket.assigneeId, 'TICKET_TRANSITION', {
        ticketId: ticket.id,
        key: ticket.key,
        from: ticket.state,
        to,
        comment,
      });
    }

    return toTicketDto(result);
  }

  /** GET /tickets/:id/transitions — opciones válidas para el rol actual. */
  async listTransitions(id: string, user: RequestUser): Promise<TransitionOptionDto[]> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      throw new AppError(ErrorCodes.TICKET_NOT_FOUND, 'Ticket no encontrado', 404);
    }
    await this.ensureMember(ticket.projectId, user.id);

    const guardCtx: TransitionGuardContext = {
      actorRole: user.role,
      actorId: user.id,
      reporterId: ticket.reporterId,
    };
    const context = new TicketContext(STATE_FACTORY[ticket.state]);
    return context.optionsFor(guardCtx);
  }

  /** GET /tickets/:id/history — historial de cambios de estado. */
  async history(id: string, user: RequestUser): Promise<TicketHistoryDto[]> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      throw new AppError(ErrorCodes.TICKET_NOT_FOUND, 'Ticket no encontrado', 404);
    }
    await this.ensureMember(ticket.projectId, user.id);

    const rows = await this.prisma.ticketHistory.findMany({
      where: { ticketId: id },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, name: true } } },
    });
    return rows.map(toHistoryDto);
  }
}
