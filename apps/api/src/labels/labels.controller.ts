import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { LabelDto, RequestUser } from '@ticketera/types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { LabelsService } from './labels.service';
import { CreateLabelDto } from './dto/labels.dto';

/** Etiquetas por proyecto: /projects/:projectId/labels */
@Controller('projects/:projectId/labels')
@UseGuards(JwtAuthGuard)
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Post()
  @HttpCode(201)
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateLabelDto,
    @CurrentUser() user: RequestUser,
  ): Promise<LabelDto> {
    return this.labels.create(projectId, user, dto);
  }

  @Get()
  list(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<LabelDto[]> {
    return this.labels.list(projectId, user);
  }
}
