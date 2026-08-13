import { Controller, Delete, HttpCode, Param, UseGuards } from '@nestjs/common';
import type { RequestUser } from '@ticketera/types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { LabelsService } from './labels.service';

/** Administración de etiquetas a nivel raíz: /labels/:id */
@Controller('labels')
@UseGuards(JwtAuthGuard)
export class LabelsAdminController {
  constructor(private readonly labels: LabelsService) {}

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.labels.remove(id, user);
  }
}
