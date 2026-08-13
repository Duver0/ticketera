import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { RequestUser, Role } from '@ticketera/types';
import { AppError, ErrorCodes } from '../errors/error-codes';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * RolesGuard: combina con @Roles(...).
 * Lee los roles requeridos de la metadata y compara con `req.user.role`.
 * Si no hay metadata de roles, permite el paso (la autorización fina por
 * proyecto/recurso la hace el service).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = req.user;
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, 'No autenticado', 401);
    }
    if (!requiredRoles.includes(user.role)) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Rol no autorizado para esta acción', 403);
    }
    return true;
  }
}
