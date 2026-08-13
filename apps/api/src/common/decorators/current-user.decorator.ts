import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestUser } from '@ticketera/types';
import { AppError, ErrorCodes } from '../errors/error-codes';

/**
 * Decorador @CurrentUser().
 * Extrae el usuario autenticado inyectado por JwtAuthGuard en `req.user`.
 * El guard ya cargó el `role` desde la base de datos (no del JWT).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const req = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = req.user;
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, 'Usuario no autenticado', 401);
    }
    return user;
  },
);
