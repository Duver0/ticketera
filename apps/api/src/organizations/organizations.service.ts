import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type {
  JoinOrganizationDto,
  OrganizationDto,
  OrganizationMemberDto,
  RequestUser,
  RotateInviteCodeResponseDto,
} from '@ticketera/types';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError, ErrorCodes } from '../common/errors/error-codes';

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

/**
 * Lógica de organizaciones y su alcance (creación, ingreso por código,
 * consulta de miembros, rotación de código). El aislamiento por org se cumple
 * aquí en el service.
 */
@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  private toOrganizationDto(
    org: { id: string; slug: string; ownerId: string; createdAt: Date; inviteCode: string },
    memberCount: number,
    includeInviteCode: boolean,
  ): OrganizationDto {
    const dto: OrganizationDto = {
      id: org.id,
      slug: org.slug,
      ownerId: org.ownerId,
      createdAt: org.createdAt.toISOString(),
      memberCount,
    };
    if (includeInviteCode) {
      dto.inviteCode = org.inviteCode;
    }
    return dto;
  }

  /** true si el usuario es dueño de la org o admin global. */
  private isOrgOwnerOrGlobal(user: RequestUser, ownerId: string): boolean {
    return user.role === 'admin' || ownerId === user.id;
  }

  /** POST /organizations — crea org; el actor queda dueño (o el ownerId si es global admin). */
  async create(
    dto: { slug: string; ownerId?: string },
    user: RequestUser,
  ): Promise<OrganizationDto> {
    // Solo un usuario sin org (o un admin global actuando por otro) puede crear.
    if (user.role !== 'admin' && user.organizationId) {
      throw new AppError(
        ErrorCodes.ORG_ALREADY_MEMBER,
        'Ya perteneces a una organización',
        409,
      );
    }

    if (
      dto.slug.length < ORG_SLUG_MIN ||
      dto.slug.length > ORG_SLUG_MAX ||
      !ORG_SLUG_RE.test(dto.slug)
    ) {
      throw new AppError(
        ErrorCodes.ORG_SLUG_INVALID,
        'El slug de organización debe ser lowercase, alfanumérico con guiones (3–40)',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // Dueño: el indicado por ownerId (solo admin global) o el actor.
    const ownerId = user.role === 'admin' && dto.ownerId ? dto.ownerId : user.id;

    try {
      const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const org = await tx.organization.create({
          data: {
            slug: dto.slug,
            ownerId,
            inviteCode: generateInviteCode(),
          },
        });
        // El dueño pasa a ser miembro de su propia org.
        await tx.user.update({
          where: { id: ownerId },
          data: { organizationId: org.id },
        });
        return org;
      });

      return this.toOrganizationDto(result, 1, this.isOrgOwnerOrGlobal(user, ownerId));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(
          ErrorCodes.ORG_SLUG_TAKEN,
          'El slug de organización ya está en uso',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
  }

  /** POST /organizations/join — une al actor a la org del código (debe ser org-less). */
  async join(dto: JoinOrganizationDto, user: RequestUser): Promise<OrganizationDto> {
    if (user.organizationId) {
      throw new AppError(
        ErrorCodes.ORG_ALREADY_MEMBER,
        'Ya perteneces a una organización',
        409,
      );
    }

    const org = await this.prisma.organization.findUnique({
      where: { inviteCode: dto.inviteCode },
    });
    if (!org) {
      throw new AppError(ErrorCodes.INVITE_CODE_INVALID, 'Código de invitación inválido', 404);
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { organizationId: org.id },
    });

    const memberCount = await this.prisma.user.count({
      where: { organizationId: org.id },
    });

    // El que se une NO es dueño: no se expone el inviteCode.
    return this.toOrganizationDto(org, memberCount, this.isOrgOwnerOrGlobal(updated, org.ownerId));
  }

  /** GET /organizations/me — la org del actor (404 si es org-less). */
  async me(user: RequestUser): Promise<OrganizationDto> {
    if (!user.organizationId) {
      throw new AppError(ErrorCodes.ORG_NOT_FOUND, 'No perteneces a una organización', 404);
    }
    const org = await this.prisma.organization.findUnique({ where: { id: user.organizationId } });
    if (!org) {
      throw new AppError(ErrorCodes.ORG_NOT_FOUND, 'Organización no encontrada', 404);
    }
    const memberCount = await this.prisma.user.count({ where: { organizationId: org.id } });
    return this.toOrganizationDto(org, memberCount, this.isOrgOwnerOrGlobal(user, org.ownerId));
  }

  /** GET /organizations/me/members — miembros de la org del actor. */
  async myMembers(user: RequestUser): Promise<OrganizationMemberDto[]> {
    if (!user.organizationId) {
      throw new AppError(ErrorCodes.ORG_NOT_FOUND, 'No perteneces a una organización', 404);
    }
    const rows = await this.prisma.user.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      joinedAt: r.createdAt.toISOString(),
    }));
  }

  /** POST /organizations/invite-code/rotate — regenera el código (dueño o global admin). */
  async rotateInviteCode(user: RequestUser): Promise<RotateInviteCodeResponseDto> {
    if (!user.organizationId) {
      throw new AppError(ErrorCodes.ORG_NOT_FOUND, 'No perteneces a una organización', 404);
    }
    const org = await this.prisma.organization.findUnique({ where: { id: user.organizationId } });
    if (!org) {
      throw new AppError(ErrorCodes.ORG_NOT_FOUND, 'Organización no encontrada', 404);
    }
    if (!this.isOrgOwnerOrGlobal(user, org.ownerId)) {
      throw new AppError(
        ErrorCodes.NOT_ORG_ADMIN,
        'Solo el dueño de la organización o un admin global puede rotar el código',
        403,
      );
    }

    // Reintenta en caso de colisión improbable del token.
    let inviteCode = generateInviteCode();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const updated = await this.prisma.organization.update({
          where: { id: org.id, inviteCode: org.inviteCode },
          data: { inviteCode },
        });
        return { inviteCode: updated.inviteCode };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          inviteCode = generateInviteCode();
          continue;
        }
        throw err;
      }
    }
    throw new AppError(ErrorCodes.INTERNAL_ERROR, 'No se pudo regenerar el código', 500);
  }

  /** GET /organizations/:id — solo admin global o dueño de esa org (404 si no). */
  async findOne(id: string, user: RequestUser): Promise<OrganizationDto> {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org || !this.isOrgOwnerOrGlobal(user, org.ownerId)) {
      // No revelar existencia: mismo 404 para "no existe" o "no autorizado".
      throw new AppError(ErrorCodes.ORG_NOT_FOUND, 'Organización no encontrada', 404);
    }
    const memberCount = await this.prisma.user.count({ where: { organizationId: org.id } });
    return this.toOrganizationDto(org, memberCount, this.isOrgOwnerOrGlobal(user, org.ownerId));
  }
}
