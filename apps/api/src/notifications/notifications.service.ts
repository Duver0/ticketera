import { Injectable } from '@nestjs/common';
import type { NotificationDto, RequestUser } from '@ticketera/types';
import { PrismaService } from '../prisma/prisma.service';
import { AppError, ErrorCodes } from '../common/errors/error-codes';

function toNotificationDto(row: {
  id: string;
  userId: string;
  type: string;
  payload: unknown;
  read: boolean;
  createdAt: Date;
}): NotificationDto {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    payload: row.payload,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Lógica de notificaciones. Se generan al crear ticket, transicionar, asignar y
 * comentar. Las acciones relevantes llaman a `notify` desde otros servicios.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Crea una notificación para un usuario. */
  async notify(userId: string, type: string, payload: unknown): Promise<void> {
    await this.prisma.notification.create({
      data: { userId, type, payload: payload as object },
    });
  }

  /** GET /notifications — propias, no leídas primero. */
  async list(userId: string, unread?: boolean): Promise<NotificationDto[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId, ...(unread === undefined ? {} : { read: !unread }) },
      orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map(toNotificationDto);
  }

  /** PATCH /notifications/:id/read — marca como leída (solo dueño). */
  async markRead(id: string, userId: string): Promise<NotificationDto> {
    const existing = await this.prisma.notification.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Notificación no encontrada', 404);
    }
    if (existing.userId !== userId) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'No puedes modificar esta notificación', 403);
    }
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
    return toNotificationDto(updated);
  }

  /** POST /notifications/read-all — marca todas como leídas (propias). */
  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }
}
