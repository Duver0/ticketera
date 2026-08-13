import { Injectable } from '@nestjs/common';
import type { AttachmentDto, RequestUser } from '@ticketera/types';
import { PrismaService } from '../prisma/prisma.service';
import { AppError, ErrorCodes } from '../common/errors/error-codes';

/** Tamaño máximo aceptado en metadata (10 MB). No subimos binario en el MVP. */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function toAttachmentDto(row: {
  id: string;
  ticketId: string;
  uploadedById: string;
  filename: string;
  url: string;
  size: number | null;
  mimeType: string | null;
  createdAt: Date;
}): AttachmentDto {
  return {
    id: row.id,
    ticketId: row.ticketId,
    uploadedById: row.uploadedById,
    filename: row.filename,
    url: row.url,
    size: row.size,
    mimeType: row.mimeType,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Lógica de adjuntos. El MVP solo registra metadata (URL enviada por el cliente). */
@Injectable()
export class AttachmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureMember(ticketId: string, userId: string): Promise<void> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { projectId: true },
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
  }

  /** POST /tickets/:ticketId/attachments */
  async create(
    ticketId: string,
    user: RequestUser,
    dto: { filename: string; url: string; size?: number; mimeType?: string },
  ): Promise<AttachmentDto> {
    await this.ensureMember(ticketId, user.id);

    if (dto.size !== undefined && dto.size > MAX_ATTACHMENT_BYTES) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        'El archivo excede el tamaño máximo permitido (10 MB)',
        400,
      );
    }

    const attachment = await this.prisma.attachment.create({
      data: {
        ticketId,
        uploadedById: user.id,
        filename: dto.filename,
        url: dto.url,
        size: dto.size,
        mimeType: dto.mimeType,
      },
    });
    return toAttachmentDto(attachment);
  }

  /** GET /tickets/:ticketId/attachments */
  async list(ticketId: string, user: RequestUser): Promise<AttachmentDto[]> {
    await this.ensureMember(ticketId, user.id);
    const rows = await this.prisma.attachment.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toAttachmentDto);
  }

  /** DELETE /attachments/:id — uploader o admin global. */
  async remove(id: string, user: RequestUser): Promise<void> {
    const attachment = await this.prisma.attachment.findUnique({ where: { id } });
    if (!attachment) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Adjunto no encontrado', 404);
    }
    if (attachment.uploadedById !== user.id && user.role !== 'admin') {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Solo el autor o un admin puede eliminar', 403);
    }
    await this.prisma.attachment.delete({ where: { id } });
  }
}
