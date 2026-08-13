import { Injectable } from '@nestjs/common';
import type { LabelDto, RequestUser } from '@ticketera/types';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError, ErrorCodes } from '../common/errors/error-codes';

function toLabelDto(row: {
  id: string;
  projectId: string;
  name: string;
  color: string | null;
}): LabelDto {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    color: row.color,
  };
}

/** Lógica de etiquetas: creación por proyecto y asociación a tickets. */
@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureMember(projectId: string, userId: string): Promise<void> {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) {
      throw new AppError(ErrorCodes.NOT_PROJECT_MEMBER, 'No eres miembro de este proyecto', 403);
    }
  }

  /** true si puede gestionar etiquetas: admin proyecto, agente global o admin global. */
  private async canManageLabels(projectId: string, user: RequestUser): Promise<boolean> {
    if (user.role === 'admin' || user.role === 'agente') return true;
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });
    return member?.roleInProject === 'admin';
  }

  /** POST /projects/:projectId/labels */
  async create(
    projectId: string,
    user: RequestUser,
    dto: { name: string; color?: string },
  ): Promise<LabelDto> {
    await this.ensureMember(projectId, user.id);
    if (!(await this.canManageLabels(projectId, user))) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'No autorizado para crear etiquetas', 403);
    }
    try {
      const label = await this.prisma.label.create({
        data: { projectId, name: dto.name, color: dto.color },
      });
      return toLabelDto(label);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(ErrorCodes.CONFLICT, 'La etiqueta ya existe en este proyecto', 409);
      }
      throw err;
    }
  }

  /** GET /projects/:projectId/labels */
  async list(projectId: string, user: RequestUser): Promise<LabelDto[]> {
    await this.ensureMember(projectId, user.id);
    const rows = await this.prisma.label.findMany({
      where: { projectId },
      orderBy: { name: 'asc' },
    });
    return rows.map(toLabelDto);
  }

  /** DELETE /labels/:id — solo admin proyecto o global. */
  async remove(id: string, user: RequestUser): Promise<void> {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) {
      throw new AppError(ErrorCodes.LABEL_NOT_FOUND, 'Etiqueta no encontrada', 404);
    }
    await this.ensureMember(label.projectId, user.id);
    if (!(await this.canManageLabels(label.projectId, user))) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'No autorizado para eliminar etiquetas', 403);
    }
    await this.prisma.label.delete({ where: { id } });
  }

  /** POST /tickets/:ticketId/labels — asocia una etiqueta al ticket (204). */
  async addToTicket(ticketId: string, labelId: string, user: RequestUser): Promise<void> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { projectId: true },
    });
    if (!ticket) {
      throw new AppError(ErrorCodes.TICKET_NOT_FOUND, 'Ticket no encontrado', 404);
    }
    await this.ensureMember(ticket.projectId, user.id);

    const label = await this.prisma.label.findUnique({ where: { id: labelId } });
    if (!label) {
      throw new AppError(ErrorCodes.LABEL_NOT_FOUND, 'Etiqueta no encontrada', 404);
    }
    if (label.projectId !== ticket.projectId) {
      throw new AppError(
        ErrorCodes.LABEL_NOT_FOUND,
        'La etiqueta no pertenece a este proyecto',
        404,
      );
    }
    await this.prisma.ticketLabel.upsert({
      where: { ticketId_labelId: { ticketId, labelId } },
      create: { ticketId, labelId },
      update: {},
    });
  }

  /** DELETE /tickets/:ticketId/labels/:labelId — desasocia (204). */
  async removeFromTicket(ticketId: string, labelId: string, user: RequestUser): Promise<void> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { projectId: true },
    });
    if (!ticket) {
      throw new AppError(ErrorCodes.TICKET_NOT_FOUND, 'Ticket no encontrado', 404);
    }
    await this.ensureMember(ticket.projectId, user.id);
    await this.prisma.ticketLabel.delete({
      where: { ticketId_labelId: { ticketId, labelId } },
    });
  }
}
