import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { ProjectRole } from '@ticketera/types';

/** POST /projects */
export class CreateProjectDto {
  @IsString()
  @MaxLength(10)
  key!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

/** PATCH /projects/:id */
export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

/** POST /projects/:id/members */
export class AddProjectMemberDto {
  @IsString()
  userId!: string;

  @IsEnum(['admin', 'agente', 'usuario'])
  roleInProject!: ProjectRole;
}
