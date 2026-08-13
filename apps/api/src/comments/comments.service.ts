import { Injectable } from '@nestjs/common';
import type { CommentDto, RequestUser } from '@ticketera/types';
import { PrismaService } from '../prisma/prisma.service';
import { AppError, ErrorCodes } from '../common/errors/error-codes';
import { NotificationsService } from '../notifications/notifications.service';

function toCommentDto(row: {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string | null; image: string | null };
}): CommentDto {
  return {
    id: row.id,
    ticketId: row.ticketId,
    authorId: row.authorId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: { id: row.author.id, name: row.author.name, image: row.author.image },
  };
}

/** Lógica de comentarios. Requiere membresía del proyecto del ticket. */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async ensureTicketMember(ticketId: string, userId: string): Promise<{ reporterId: string; assigneeId: string | null; key: string }> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { projectId: true, reporterId: true, assigneeId: true, key: true },
    });
    if (!ticket) {
      throw new AppError(ErrorCodes.TICKET_NOT_FOUND, 'Ticket no encontrado', 404);
    }
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: ticket.projectId, userId } },
    });
    if (!member) {
      throw new AppError(ErrorCodes.NOT_PROJECT_MEMBER, 'No eres miembro de este proyecto', 403);
    }
    return { reporterId: ticket.reporterId, assigneeId: ticket.assigneeId, key: ticket.key };
  }

  /** POST /tickets/:ticketId/comments */
  async create(ticketId: string, user: RequestUser, body: string): Promise<CommentDto> {
    const ticket = await this.ensureTicketMember(ticketId, user.id);
    const comment = await this.prisma.comment.create({
      data: { ticketId, authorId: user.id, body },
      include: { author: { select: { id: true, name: true, image: true } } },
    });
    // Notificar a reportero y asignado (excepto al autor).
    if (ticket.reporterId !== user.id) {
      await this.notifications.notify(ticket.reporterId, 'TICKET_COMMENT', {
        ticketId,
        key: ticket.key,
      });
    }
    if (ticket.assigneeId && ticket.assigneeId !== user.id) {
      await this.notifications.notify(ticket.assigneeId, 'TICKET_COMMENT', {
        ticketId,
        key: ticket.key,
      });
    }
    return toCommentDto(comment);
  }

  /** GET /tickets/:ticketId/comments */
  async findAll(ticketId: string, user: RequestUser): Promise<CommentDto[]> {
    await this.ensureTicketMember(ticketId, user.id);
    const rows = await this.prisma.comment.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, name: true, image: true } } },
    });
    return rows.map(toCommentDto);
  }

  /** PATCH /tickets/:ticketId/comments/:commentId — solo autor o admin. */
  async update(ticketId: string, commentId: string, user: RequestUser, body: string): Promise<CommentDto> {
    await this.ensureTicketMember(ticketId, user.id);
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) {
      throw new AppError(ErrorCodes.COMMENT_NOT_FOUND, 'Comentario no encontrado', 404);
    }
    if (comment.authorId !== user.id && user.role !== 'admin') {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Solo el autor o un admin puede editar', 403);
    }
    const updated = await this.prisma.comment.update({
      where: { id: commentId },
      data: { body },
      include: { author: { select: { id: true, name: true, image: true } } },
    });
    return toCommentDto(updated);
  }

  /** DELETE /tickets/:ticketId/comments/:commentId — solo autor o admin. */
  async remove(ticketId: string, commentId: string, user: RequestUser): Promise<void> {
    await this.ensureTicketMember(ticketId, user.id);
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) {
      throw new AppError(ErrorCodes.COMMENT_NOT_FOUND, 'Comentario no encontrado', 404);
    }
    if (comment.authorId !== user.id && user.role !== 'admin') {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Solo el autor o un admin puede eliminar', 403);
    }
    await this.prisma.comment.delete({ where: { id: commentId } });
  }
}
