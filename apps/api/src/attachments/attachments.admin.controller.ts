import { Controller, Delete, HttpCode, Param, UseGuards } from '@nestjs/common';
import type { RequestUser } from '@ticketera/types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AttachmentsService } from './attachments.service';

/** Administración de adjuntos a nivel raíz: /attachments/:id */
@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsAdminController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.attachments.remove(id, user);
  }
}
