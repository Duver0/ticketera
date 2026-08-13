import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser } from '@ticketera/types';
import { AppError, ErrorCodes } from '../errors/error-codes';

/**
 * AdminGuard: solo permite al rol global `admin`.
 * Atajo de RolesGuard para endpoints estrictamente administrativos.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = req.user;
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, 'No autenticado', 401);
    }
    if (user.role !== 'admin') {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Se requiere rol de administrador', 403);
    }
    return true;
  }
}
