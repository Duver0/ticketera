import { Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import type { LoginDto, RegisterDto, SessionUser } from '@ticketera/types';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError, ErrorCodes } from '../common/errors/error-codes';

/** Número de rondas de bcrypt (equilibrio costo/seguridad para serverless). */
const SALT_ROUNDS = 10;

/** Password debe incluir al menos una letra y un dígito. */
const PASSWORD_FORMAT = /(?=.*[A-Za-z])(?=.*\d)/;

/**
 * Slug de organización: lowercase, alfanumérico con guiones, sin guiones al
 * inicio/final ni consecutivos. Longitud 3–40 (ver docs/organizaciones.md §3.1).
 */
const ORG_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ORG_SLUG_MIN = 3;
const ORG_SLUG_MAX = 40;

/** Genera un token opaco de invitación (no derivado del slug). */
function generateInviteCode(): string {
  return randomBytes(24).toString('base64url');
}

/** Convierte una fila User de Prisma a SessionUser (sin exponer passwordHash). */
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
 * Lógica de autenticación por credenciales (registro/login).
 * La API NO emite JWT: estos endpoints son de verificación/provisioning y
 * devuelven el SessionUser (Auth.js en el Web firma el JWT con el mismo
 * AUTH_SECRET). Ver docs/auth-design.md.
 */
@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra una cuenta con credenciales.
   * - Email ya existente (GitHub o credenciales) -> 409 EMAIL_ALREADY_EXISTS.
   * - Password débil (<8 o sin letra+dígito) -> 400 WEAK_PASSWORD.
   * - Org: puede CREAR (organizationSlug) o UNIRSE (inviteCode); son mutuamente
   *   excluyentes. Ambos -> 422 VALIDATION_ERROR. Slug inválido -> 422
   *   ORG_SLUG_INVALID; duplicado -> 409 ORG_SLUG_TAKEN. Código inválido ->
   *   404 INVITE_CODE_INVALID. Si ninguno -> usuario org-less (cubre OAuth sync).
   * - Éxito: crea User (role `usuario`) y, en una transacción, la org o el
   *   enlace a la org existente.
   */
  async register(dto: RegisterDto): Promise<SessionUser> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new AppError(
        ErrorCodes.EMAIL_ALREADY_EXISTS,
        'El email ya está registrado',
        HttpStatus.CONFLICT,
      );
    }

    if (dto.password.length < 8 || !PASSWORD_FORMAT.test(dto.password)) {
      throw new AppError(
        ErrorCodes.WEAK_PASSWORD,
        'La contraseña debe tener al menos 8 caracteres e incluir letras y números',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validación de exclusión mutua de opciones de org.
    if (dto.organizationSlug && dto.inviteCode) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        'No puedes crear y unirte a una organización al mismo tiempo',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // Validación de formato de slug (antes de la transacción).
    if (dto.organizationSlug) {
      const slug = dto.organizationSlug;
      if (
        slug.length < ORG_SLUG_MIN ||
        slug.length > ORG_SLUG_MAX ||
        !ORG_SLUG_RE.test(slug)
      ) {
        throw new AppError(
          ErrorCodes.ORG_SLUG_INVALID,
          'El slug de organización debe ser lowercase, alfanumérico con guiones (3–40)',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    try {
      const created = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const user = await tx.user.create({
          data: {
            email: dto.email,
            name: dto.name,
            image: null,
            role: 'usuario',
            passwordHash,
          },
        });

        if (dto.organizationSlug) {
          // El slug es único: P2002 se mapea a ORG_SLUG_TAKEN (carrera).
          const org = await tx.organization.create({
            data: {
              slug: dto.organizationSlug,
              ownerId: user.id,
              inviteCode: generateInviteCode(),
            },
          });
          const linked = await tx.user.update({
            where: { id: user.id },
            data: { organizationId: org.id },
          });
          return linked;
        }

        if (dto.inviteCode) {
          const org = await tx.organization.findUnique({
            where: { inviteCode: dto.inviteCode },
          });
          if (!org) {
            throw new AppError(
              ErrorCodes.INVITE_CODE_INVALID,
              'Código de invitación inválido',
              HttpStatus.NOT_FOUND,
            );
          }
          return await tx.user.update({
            where: { id: user.id },
            data: { organizationId: org.id },
          });
        }

        return user;
      });

      return toSessionUser(created);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Colisión de slug (o de inviteCode, improbable).
        throw new AppError(
          ErrorCodes.ORG_SLUG_TAKEN,
          'El slug de organización ya está en uso',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
  }

  /**
   * Login con credenciales.
   * Mensaje genérico: no diferencia "email no existe" de "password incorrecta"
   * para evitar enumeración de cuentas.
   * - Usuario inexistente o sin passwordHash (cuenta OAuth) -> 401.
   * - password no coincide -> 401.
   */
  async login(dto: LoginDto): Promise<SessionUser> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Genérico: mismo error indistintamente del motivo.
    const invalid = (): never => {
      throw new AppError(
        ErrorCodes.INVALID_CREDENTIALS,
        'Credenciales inválidas',
        HttpStatus.UNAUTHORIZED,
      );
    };

    if (!user || user.passwordHash === null) {
      return invalid();
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      return invalid();
    }

    return toSessionUser(user);
  }
}
