import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { Priority, TicketStateValue, TicketType } from '@ticketera/types';

const PRIORITIES: readonly Priority[] = ['baja', 'media', 'alta', 'urgente'];
const TYPES: readonly TicketType[] = ['bug', 'feature', 'tarea', 'epic'];
const STATES: readonly TicketStateValue[] = [
  'abierto',
  'en_progreso',
  'en_revision',
  'resuelto',
  'cerrado',
  'reabierto',
];

/** POST /tickets (o /projects/:projectId/tickets). */
export class CreateTicketDto {
  @IsString()
  projectId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: Priority;

  @IsOptional()
  @IsIn(TYPES)
  type?: TicketType;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labelIds?: string[];
}

/** PATCH /tickets/:id */
export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: Priority;

  @IsOptional()
  @IsIn(TYPES)
  type?: TicketType;

  // null = desasignar; string = asignar a ese usuario.
  @IsOptional()
  @IsString()
  assigneeId?: string | null;
}

/** POST /tickets/:id/transitions */
export class TransitionTicketDto {
  @IsIn(STATES)
  to!: TicketStateValue;

  @IsOptional()
  @IsString()
  comment?: string;
}

/** GET /tickets (filtros + paginación). */
export class TicketQueryDto {
  /** Opcional: si se omite, el listado se acota a los proyectos/organización
   *  del usuario (visor "Mis tickets" en el dashboard). */
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsIn(STATES)
  state?: TicketStateValue;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  reporterId?: string;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: Priority;

  @IsOptional()
  @IsIn(TYPES)
  type?: TicketType;

  @IsOptional()
  @IsString()
  labelId?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;
}
