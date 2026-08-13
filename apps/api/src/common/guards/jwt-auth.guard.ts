import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import type { RequestUser, Role } from '@ticketera/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError, ErrorCodes } from '../errors/error-codes';

/**
 * Guard de autenticación JWT para la API.
 *
 * Flujo:
 *  1. Lee `Authorization: Bearer <jwt>` (el JWT lo firma Auth.js en el Web con el
 *     MISMO `AUTH_SECRET`, estrategia JWT, HS256).
 *  2. Verifica la firma y expira con @nestjs/jwt.
 *  3. Extrae `sub` (userId) y `email` del payload.
 *  4. Carga el `User` desde Prisma y adjunta `{ id, email, role }` a `req.user`.
 *     NO confiamos en el rol que traiga el JWT: siempre lo leemos de la DB.
 *  5. Si el usuario aún no existe en la DB (primer login, pre-sync), se adjunta
 *     un usuario sintético `{ id: sub, email, role: 'usuario' }` para que
 *     `POST /users/sync` pueda crearlo.
 *
 * Responde 401 (UNAUTHENTICATED) si no hay token o es inválido.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const header = req.headers['authorization'];

    if (!header || typeof header !== 'string') {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, 'Falta el token de autorización', 401);
    }

    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, 'Formato de token inválido', 401);
    }

    let payload: Record<string, unknown>;
    try {
      payload = this.jwtService.verify<Record<string, unknown>>(token, {
        secret: process.env.AUTH_SECRET,
      });
    } catch {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, 'Token inválido o expirado', 401);
    }

    const userId = typeof payload['sub'] === 'string' ? payload['sub'] : undefined;
    const email = typeof payload['email'] === 'string' ? payload['email'] : undefined;
    const name =
      typeof payload['name'] === 'string' ? payload['name'] : null;
    const image =
      typeof payload['picture'] === 'string' ? payload['picture'] : null;

    let role: Role = 'usuario';
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        role = user.role;
      } else if (email) {
        const byEmail = await this.prisma.user.findUnique({ where: { email } });
        if (byEmail) {
          role = byEmail.role;
        }
      }
    }

    req.user = {
      id: userId ?? email ?? '',
      email: email ?? '',
      role,
      name,
      image,
    };

    return true;
  }
}
