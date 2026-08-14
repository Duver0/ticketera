import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
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

/**
 * POST /projects/:id/members
 * Acepta `userId` O `email` (exactamente uno requerido). `roleInProject`
 * opcional (default `operador` en el service).
 */
export class AddProjectMemberDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(['admin', 'supervisor', 'operador'])
  roleInProject?: ProjectRole;
}

/** PATCH /projects/:id/members/:userId */
export class UpdateProjectMemberDto {
  @IsEnum(['admin', 'supervisor', 'operador'])
  roleInProject!: ProjectRole;
}

/** GET /projects/:id/candidates?q= */
export class CandidatesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;
}
