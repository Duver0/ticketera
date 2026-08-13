import { Body, Controller, Delete, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { RequestUser } from '@ticketera/types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { LabelsService } from './labels.service';
import { AssociateLabelDto } from './dto/labels.dto';

/** Asociación de etiquetas a tickets: /tickets/:ticketId/labels */
@Controller('tickets/:ticketId/labels')
@UseGuards(JwtAuthGuard)
export class TicketLabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Post()
  @HttpCode(204)
  add(
    @Param('ticketId') ticketId: string,
    @Body() dto: AssociateLabelDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.labels.addToTicket(ticketId, dto.labelId, user);
  }

  @Delete(':labelId')
  @HttpCode(204)
  remove(
    @Param('ticketId') ticketId: string,
    @Param('labelId') labelId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.labels.removeFromTicket(ticketId, labelId, user);
  }
}
