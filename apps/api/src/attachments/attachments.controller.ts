import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { AttachmentDto, RequestUser } from '@ticketera/types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AttachmentsService } from './attachments.service';
import { CreateAttachmentDto } from './dto/attachments.dto';

/** Adjuntos por ticket: /tickets/:ticketId/attachments */
@Controller('tickets/:ticketId/attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post()
  @HttpCode(201)
  create(
    @Param('ticketId') ticketId: string,
    @Body() dto: CreateAttachmentDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AttachmentDto> {
    return this.attachments.create(ticketId, user, dto);
  }

  @Get()
  list(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<AttachmentDto[]> {
    return this.attachments.list(ticketId, user);
  }
}
