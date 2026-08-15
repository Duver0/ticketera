import { Injectable } from '@nestjs/common';
import type {
  ProjectRole,
  RequestUser,
  TicketActivityDto,
  TicketAuditDto,
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
import { TicketPolicy } from './ticket-policy';
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

function toAuditDto(row: {
  id: string;
  ticketId: string;
  actorId: string;
  field: string;
  fromValue: string | null;
  toValue: string | null;
  createdAt: Date;
  actor: { id: string; name: string | null };
}): TicketAuditDto {
  return {
    id: row.id,
    ticketId: row.ticketId,
    actorId: row.actorId,
    field: row.field as TicketAuditDto['field'],
    fromValue: row.fromValue,
    toValue: row.toValue,
    createdAt: row.createdAt.toISOString(),
    actor: { id: row.actor.id, name: row.actor.name },
  };
}

/** Campos de ticket auditables en ediciones (PATCH / tomar ticket). */
const AUDITABLE_FIELDS = ['title', 'description', 'priority', 'type', 'assigneeId'] as const;
type AuditableField = (typeof AUDITABLE_FIELDS)[number];

/**
 * Lógica de tickets: creación con código correlativo, listado filtrado por
 * visibilidad de rol, edición con auditoría de campos, transiciones de estado
 * (Patrón State) y generación de notificaciones.
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

  /** Resuelve el rol de proyecto del usuario (null si no es miembro). */
  private async resolveProjectRole(
    projectId: string,
    userId: string,
  ): Promise<ProjectRole | null> {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    return member?.roleInProject ?? null;
  }

  /** true si el actor puede editar/asignar el ticket (respeta visibilidad). */
  private async canEdit(
    ticket: { projectId: string; reporterId: string; assigneeId: string | null; state: TicketStateValue },
    user: RequestUser,
  ): Promise<boolean> {
    if (user.role === 'admin') return true;
    const role = await this.resolveProjectRole(ticket.projectId, user.id);
    if (role === 'admin' || role === 'supervisor') return true;
    if (role === 'operador') {
      // Un operador edita cualquier ticket visible para él.
      return TicketPolicy.isOperadorVisible(ticket, user.id);
    }
    // Legacy por rol global (no debería ocurrir para miembros).
    if (ticket.reporterId === user.id) return true;
    if (ticket.assigneeId === user.id) return true;
    if (user.role === 'agente') {
      const member = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: ticket.projectId, userId: user.id } },
      });
      if (member) return true;
    }
    return false;
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

  /**
   * GET /tickets — listado filtrado + paginación (requiere membresía).
   * Aplica el filtro de visibilidad por `ProjectRole` (server-side): el admin
   * global y admin/supervisor de proyecto ven todos; el operador ve solo los
   * visibles para él.
   */
  async findAll(query: TicketQueryDto, user: RequestUser): Promise<TicketDto[]> {
    // Filtros escalares compartidos por ambas ramas (con/sin projectId).
    const scalar: Prisma.TicketWhereInput = {
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

    let projectScope: Prisma.TicketWhereInput;
    let visibility: Prisma.TicketWhereInput | null = null;

    if (query.projectId) {
      // Rama clásica: proyecto explícito (requiere membresía).
      await this.ensureMember(query.projectId, user.id);
      const role = await this.resolveProjectRole(query.projectId, user.id);
      if (user.role !== 'admin' && role !== 'admin' && role !== 'supervisor') {
        visibility = TicketPolicy.visibleWhere(user.id, role ?? 'operador');
      }
      projectScope = { projectId: query.projectId };
    } else {
      // Sin projectId: "Mis tickets" — se acota a los proyectos del usuario
      // (o a toda su organización si es admin global), respetando visibilidad.
      const memberships = await this.prisma.projectMember.findMany({
        where: { userId: user.id },
        select: { projectId: true, roleInProject: true },
      });
      const memberProjectIds = memberships.map((m) => m.projectId);

      if (user.role === 'admin') {
        // Admin global: ve los tickets de su org (o todos si no tiene org).
        if (user.organizationId) {
          const orgProjects = await this.prisma.project.findMany({
            where: { organizationId: user.organizationId },
            select: { id: true },
          });
          const orgProjectIds = orgProjects.map((p) => p.id);
          projectScope = orgProjectIds.length
            ? { projectId: { in: orgProjectIds } }
            : { projectId: { in: [] } };
        } else {
          projectScope = {}; // sin filtro de proyecto: todos los tickets
        }
      } else {
        if (memberProjectIds.length === 0) return [];
        const isOperador = memberships.some((m) => m.roleInProject === 'operador');
        if (isOperador) visibility = TicketPolicy.visibleWhere(user.id, 'operador');
        projectScope = { projectId: { in: memberProjectIds } };
      }
    }

    const where: Prisma.TicketWhereInput = {
      ...projectScope,
      ...(visibility ?? {}),
      ...scalar,
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

  /**
   * GET /tickets/:id — detalle (requiere membresía + visibilidad por rol).
   * Un operador cuyo ticket no es visible recibe 403 (no se revela existencia).
   */
  async findOne(id: string, user: RequestUser): Promise<TicketDto> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      throw new AppError(ErrorCodes.TICKET_NOT_FOUND, 'Ticket no encontrado', 404);
    }
    await this.ensureMember(ticket.projectId, user.id);

    if (user.role !== 'admin') {
      const role = await this.resolveProjectRole(ticket.projectId, user.id);
      if (role === 'operador' && !TicketPolicy.isOperadorVisible(ticket, user.id)) {
        throw new AppError(ErrorCodes.NOT_PROJECT_MEMBER, 'No tienes visibilidad de este ticket', 403);
      }
    }

    return toTicketDto(ticket);
  }

  /**
   * PATCH /tickets/:id — edita campos (autorización fina + auditoría).
   * Registra en `TicketAudit` cada campo modificado (incluido "tomar ticket":
   * assigneeId null -> userId).
   */
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

    // Detecta los campos realmente cambiados para auditarlos.
    const audits: { field: AuditableField; fromValue: string | null; toValue: string | null }[] = [];
    for (const field of AUDITABLE_FIELDS) {
      const next = dto[field as keyof UpdateTicketDto];
      if (next === undefined) continue;
      const current = ticket[field as keyof typeof ticket] as string | null;
      const nextStr = next === null ? null : String(next);
      if (current !== nextStr) {
        audits.push({ field, fromValue: current, toValue: nextStr });
      }
    }

    const previousAssignee = ticket.assigneeId;
    const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const row = await tx.ticket.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          priority: dto.priority,
          type: dto.type,
          assigneeId: dto.assigneeId === undefined ? undefined : dto.assigneeId,
        },
      });
      if (audits.length) {
        await tx.ticketAudit.createMany({
          data: audits.map((a) => ({
            ticketId: id,
            actorId: user.id,
            field: a.field,
            fromValue: a.fromValue,
            toValue: a.toValue,
          })),
        });
      }
      return row;
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
   * Persiste Ticket + TicketHistory en una transacción y notifica. El contexto de
   * guarda ahora incluye el `ProjectRole` del actor.
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

    const projectRole = await this.resolveProjectRole(ticket.projectId, user.id);
    const guardCtx: TransitionGuardContext = {
      actorRole: user.role,
      actorId: user.id,
      reporterId: ticket.reporterId,
      projectRole: projectRole ?? undefined,
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

    const projectRole = await this.resolveProjectRole(ticket.projectId, user.id);
    const guardCtx: TransitionGuardContext = {
      actorRole: user.role,
      actorId: user.id,
      reporterId: ticket.reporterId,
      projectRole: projectRole ?? undefined,
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

  /**
   * GET /tickets/:id/activity — feed unificado (historial de estado + auditoría
   * de ediciones) ordenado por fecha desc. No duplica escritura: mezcla las dos
   * tablas en lectura.
   */
  async activity(id: string, user: RequestUser): Promise<TicketActivityDto[]> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      throw new AppError(ErrorCodes.TICKET_NOT_FOUND, 'Ticket no encontrado', 404);
    }
    await this.ensureMember(ticket.projectId, user.id);

    if (user.role !== 'admin') {
      const role = await this.resolveProjectRole(ticket.projectId, user.id);
      if (role === 'operador' && !TicketPolicy.isOperadorVisible(ticket, user.id)) {
        throw new AppError(ErrorCodes.NOT_PROJECT_MEMBER, 'No tienes visibilidad de este ticket', 403);
      }
    }

    const [histories, audits] = await Promise.all([
      this.prisma.ticketHistory.findMany({
        where: { ticketId: id },
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { id: true, name: true } } },
      }),
      this.prisma.ticketAudit.findMany({
        where: { ticketId: id },
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { id: true, name: true } } },
      }),
    ]);

    const stateEntries: TicketActivityDto[] = histories.map((h) => ({
      id: h.id,
      ticketId: h.ticketId,
      actorId: h.actorId,
      kind: 'state',
      createdAt: h.createdAt.toISOString(),
      actor: { id: h.actor.id, name: h.actor.name },
      fromState: h.fromState,
      toState: h.toState,
    }));

    const editEntries: TicketActivityDto[] = audits.map((a) => ({
      id: a.id,
      ticketId: a.ticketId,
      actorId: a.actorId,
      kind: 'edit',
      createdAt: a.createdAt.toISOString(),
      actor: { id: a.actor.id, name: a.actor.name },
      field: a.field as TicketActivityDto['field'],
      fromValue: a.fromValue,
      toValue: a.toValue,
    }));

    return [...stateEntries, ...editEntries].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
}
