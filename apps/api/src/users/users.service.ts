import { Injectable } from '@nestjs/common';
import type { RequestUser, SessionUser } from '@ticketera/types';
import { PrismaService } from '../prisma/prisma.service';
import { AppError, ErrorCodes } from '../common/errors/error-codes';

/** Convierte una fila User de Prisma a SessionUser (contrato). */
function toSessionUser(row: {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: SessionUser['role'];
  organizationId: string | null;
}): SessionUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    image: row.image,
    role: row.role,
    organizationId: row.organizationId,
  };
}

/**
 * Lógica de usuarios. El guard ya validó el JWT y cargó el rol desde la DB.
 * Aquí sincronizamos la fila User (primer login) y exponemos el perfil.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Asegura que exista la fila User (E1: primer login vía Auth.js).
   * Crea con rol `usuario` si no existe; si ya existe, actualiza name/image.
   * Devuelve el SessionUser con su rol real.
   */
  async sync(user: RequestUser): Promise<SessionUser> {
    const existing = user.id
      ? await this.prisma.user.findUnique({ where: { id: user.id } })
      : null;
    const byEmail = !existing && user.email
      ? await this.prisma.user.findUnique({ where: { email: user.email } })
      : null;

    if (existing) {
      return toSessionUser(existing);
    }

    const created = await this.prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name ?? byEmail?.name ?? null, image: user.image ?? byEmail?.image ?? null },
      create: {
        id: user.id || undefined,
        email: user.email,
        name: user.name ?? null,
        image: user.image ?? null,
        role: 'usuario',
      },
    });
    return toSessionUser(created);
  }

  /** GET /users/me — perfil propio. */
  async me(user: RequestUser): Promise<SessionUser> {
    const row = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!row) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, 'Usuario no encontrado', 404);
    }
    return toSessionUser(row);
  }

  /** GET /users — lista completa (solo admin). */
  async findAll(): Promise<SessionUser[]> {
    const rows = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(toSessionUser);
  }

  /** GET /users/:id — un usuario (solo admin). */
  async findOne(id: string): Promise<SessionUser> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    if (!row) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, 'Usuario no encontrado', 404);
    }
    return toSessionUser(row);
  }

  /**
   * PATCH /users/:id/role — cambia el rol global.
   * Regla de negocio: no se permite dejar al sistema sin administradores
   * (no degradar el último admin).
   */
  async updateRole(id: string, role: SessionUser['role']): Promise<SessionUser> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, 'Usuario no encontrado', 404);
    }

    if (target.role === 'admin' && role !== 'admin') {
      const adminCount = await this.prisma.user.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        throw new AppError(
          ErrorCodes.CONFLICT,
          'No se puede degradar al último administrador del sistema',
          409,
        );
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role },
    });
    return toSessionUser(updated);
  }
}
