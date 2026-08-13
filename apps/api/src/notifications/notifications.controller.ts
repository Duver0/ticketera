import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { NotificationDto, RequestUser } from '@ticketera/types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query('unread') unread?: string,
  ): Promise<NotificationDto[]> {
    const parsed = unread === undefined ? undefined : unread === 'true';
    return this.notifications.list(user.id, parsed);
  }

  @Patch(':id/read')
  markRead(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<NotificationDto> {
    return this.notifications.markRead(id, user.id);
  }

  @Post('read-all')
  @HttpCode(204)
  markAllRead(@CurrentUser() user: RequestUser): Promise<void> {
    return this.notifications.markAllRead(user.id);
  }
}
