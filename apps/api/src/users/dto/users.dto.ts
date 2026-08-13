import { IsEnum, IsString } from 'class-validator';
import type { Role } from '@ticketera/types';

/** Body de PATCH /users/:id/role. */
export class UpdateUserRoleDto {
  @IsEnum(['admin', 'agente', 'usuario'])
  role!: Role;
}

/** Query de GET /users (sin filtros por ahora, reservado). */
export class ListUsersQueryDto {
  @IsString()
  // permite filtrar por rol en el futuro; no obligatorio
  role?: Role;
}
