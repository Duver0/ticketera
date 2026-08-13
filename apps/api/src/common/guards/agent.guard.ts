import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser } from '@ticketera/types';
import { AppError, ErrorCodes } from '../errors/error-codes';

/**
 * AgentGuard: permite a `agente` o `admin` (admin > agente).
 * Atajo para acciones de gestión que cualquier agente puede ejecutar.
 */
@Injectable()
export class AgentGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = req.user;
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, 'No autenticado', 401);
    }
    if (user.role !== 'agente' && user.role !== 'admin') {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Se requiere rol de agente o administrador', 403);
    }
    return true;
  }
}
