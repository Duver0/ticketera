import { Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { LoginDto, RegisterDto, SessionUser } from '@ticketera/types';
import { PrismaService } from '../prisma/prisma.service';
import { AppError, ErrorCodes } from '../common/errors/error-codes';

/** Número de rondas de bcrypt (equilibrio costo/seguridad para serverless). */
const SALT_ROUNDS = 10;

/** Password debe incluir al menos una letra y un dígito. */
const PASSWORD_FORMAT = /(?=.*[A-Za-z])(?=.*\d)/;

/** Convierte una fila User de Prisma a SessionUser (sin exponer passwordHash). */
function toSessionUser(row: {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: SessionUser['role'];
}): SessionUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    image: row.image,
    role: row.role,
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
   * - Éxito: crea User con role `usuario` y passwordHash (bcrypt).
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

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        image: null,
        role: 'usuario',
        passwordHash,
      },
    });

    return toSessionUser(created);
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
