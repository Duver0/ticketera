import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  RequestUser,
  TicketActivityDto,
  TicketDto,
  TicketHistoryDto,
  TransitionOptionDto,
} from '@ticketera/types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TicketsService } from './tickets.service';
import {
  CreateTicketDto,
  TicketQueryDto,
  TransitionTicketDto,
  UpdateTicketDto,
} from './dto/tickets.dto';

/**
 * Rutas de tickets. Todas requieren autenticación (JwtAuthGuard); la
 * autorización por proyecto/recurso se valida en el service.
 *
 * Nota: el contrato (api-contract.md §2.4) define `POST /tickets` con `projectId`
 * en el body (no `/projects/:projectId/tickets`). Se implementa según el contrato.
 */
@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: RequestUser): Promise<TicketDto> {
    return this.tickets.create(dto, user);
  }

  @Get()
  findAll(
    @Query() query: TicketQueryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TicketDto[]> {
    return this.tickets.findAll(query, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<TicketDto> {
    return this.tickets.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TicketDto> {
    return this.tickets.update(id, user, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<void> {
    return this.tickets.remove(id, user);
  }

  @Get(':id/history')
  history(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<TicketHistoryDto[]> {
    return this.tickets.history(id, user);
  }

  @Get(':id/activity')
  activity(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<TicketActivityDto[]> {
    return this.tickets.activity(id, user);
  }

  @Get(':id/transitions')
  listTransitions(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<TransitionOptionDto[]> {
    return this.tickets.listTransitions(id, user);
  }

  @Post(':id/transitions')
  @HttpCode(200)
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionTicketDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TicketDto> {
    return this.tickets.transition(id, dto.to, user, dto.comment);
  }
}
