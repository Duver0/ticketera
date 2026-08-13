import { SetMetadata } from '@nestjs/common';
import type { Role } from '@ticketera/types';

/** Clave de metadata donde se guardan los roles requeridos. */
export const ROLES_KEY = 'roles';

/**
 * Decorador @Roles('admin', 'agente').
 * Combina con RolesGuard para restringir un handler/controlador a ciertos roles
 * globales. Si no se usa, RolesGuard permite el acceso (la autorización fina por
 * proyecto/recurso se hace en el service).
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
