import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  OrganizationMemberDto,
  ProjectDto,
  ProjectMemberDto,
  ProjectRole,
  RequestUser,
  Role,
} from '@ticketera/types';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError, ErrorCodes } from '../common/errors/error-codes';

function toProjectDto(row: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  createdById: string;
  createdAt: Date;
}): ProjectDto {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
  };
}

function toProjectMemberDto(row: {
  id: string;
  projectId: string;
  userId: string;
  roleInProject: ProjectRole;
  user: { id: string; name: string | null; email: string; image: string | null };
}): ProjectMemberDto {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    roleInProject: row.roleInProject,
    user: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      image: row.user.image,
    },
  };
}

function toOrganizationMemberDto(row: {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  createdAt: Date;
}): OrganizationMemberDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    joinedAt: row.createdAt.toISOString(),
  };
}

/**
 * Lógica de proyectos y membresías.
 * La autorización por proyecto (`roleInProject` / admin global) y el alcance por
 * organización se validan aquí, no solo con el rol global.
 */
@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lanza NOT_PROJECT_MEMBER si el usuario no es miembro del proyecto. */
  private async ensureMember(projectId: string, userId: string): Promise<void> {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) {
      throw new AppError(
        ErrorCodes.NOT_PROJECT_MEMBER,
        'No eres miembro de este proyecto',
        403,
      );
    }
  }

  /** Resuelve el rol de proyecto del usuario (null si no es miembro). */
  private async resolveProjectRole(
    projectId: string,
    userId: string,
  ): Promise<ProjectRole | null> {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    return member?.roleInProject ?? null;
  }

  /** true si el usuario es admin de proyecto o admin global. */
  private async isProjectAdmin(
    projectId: string,
    user: RequestUser,
  ): Promise<boolean> {
    if (user.role === 'admin') return true;
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });
    return member?.roleInProject === 'admin';
  }

  /** true si el usuario es admin o supervisor de proyecto, o admin global. */
  private async isProjectAdminOrSupervisor(
    projectId: string,
    user: RequestUser,
  ): Promise<boolean> {
    if (user.role === 'admin') return true;
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });
    return member?.roleInProject === 'admin' || member?.roleInProject === 'supervisor';
  }

  /** Devuelve la organizationId del proyecto. */
  private async getProjectOrgId(projectId: string): Promise<string> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });
    if (!project) {
      throw new AppError(ErrorCodes.PROJECT_NOT_FOUND, 'Proyecto no encontrado', 404);
    }
    return project.organizationId;
  }

  /** POST /projects — crea proyecto y deja al creador como owner (admin). */
  async create(
    dto: { key: string; name: string; description?: string },
    user: RequestUser,
  ): Promise<ProjectDto> {
    // El creador debe pertenecer a una organización (alcance por org).
    if (!user.organizationId) {
      throw new AppError(
        ErrorCodes.ORG_REQUIRED,
        'Debes pertenecer a una organización para crear proyectos',
        409,
      );
    }

    const key = dto.key.trim().toUpperCase();
    try {
      const project = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const created = await tx.project.create({
          data: {
            key,
            name: dto.name,
            description: dto.description,
            createdById: user.id,
            organizationId: user.organizationId!,
          },
        });
        await tx.projectMember.create({
          data: {
            projectId: created.id,
            userId: user.id,
            roleInProject: 'admin',
          },
        });
        return created;
      });
      return toProjectDto(project);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(ErrorCodes.CONFLICT, 'La clave de proyecto ya existe', 409);
      }
      throw err;
    }
  }

  /** GET /projects — proyectos donde el usuario es miembro. */
  async findAll(userId: string): Promise<ProjectDto[]> {
    const rows = await this.prisma.project.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toProjectDto);
  }

  /** GET /projects/:id — detalle (requiere membresía). */
  async findOne(id: string, userId: string): Promise<ProjectDto> {
    await this.ensureMember(id, userId);
    const row = await this.prisma.project.findUnique({ where: { id } });
    if (!row) {
      throw new AppError(ErrorCodes.PROJECT_NOT_FOUND, 'Proyecto no encontrado', 404);
    }
    return toProjectDto(row);
  }

  /** PATCH /projects/:id — edita nombre/descripción (admin proyecto o global). */
  async update(
    id: string,
    user: RequestUser,
    dto: { name?: string; description?: string },
  ): Promise<ProjectDto> {
    await this.ensureMember(id, user.id);
    if (!(await this.isProjectAdmin(id, user))) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Solo un admin de proyecto puede editarlo', 403);
    }
    const row = await this.prisma.project.update({
      where: { id },
      data: { name: dto.name, description: dto.description },
    });
    return toProjectDto(row);
  }

  /** DELETE /projects/:id — elimina (admin proyecto o global). */
  async remove(id: string, user: RequestUser): Promise<void> {
    await this.ensureMember(id, user.id);
    if (!(await this.isProjectAdmin(id, user))) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Solo un admin de proyecto puede eliminarlo', 403);
    }
    await this.prisma.project.delete({ where: { id } });
  }

  /** GET /projects/:id/members — lista de miembros (requiere membresía). */
  async listMembers(projectId: string, userId: string): Promise<ProjectMemberDto[]> {
    await this.ensureMember(projectId, userId);
    const rows = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map(toProjectMemberDto);
  }

  /**
   * POST /projects/:id/members — añade miembro.
   * Autoriza admin de proyecto o supervisor. Resuelve el objetivo por `userId` o
   * `email`; aplica filtro de org (el objetivo debe pertenecer a la MISMA org del
   * proyecto o se responde 404 USER_NOT_FOUND, sin revelar existencia cross-org).
   * Idempotente (ya miembro -> 200 con el existente). Un supervisor no puede
   * otorgar el rol `admin` (-> 403 CANNOT_GRANT_PROJECT_ADMIN).
   */
  async addMember(
    projectId: string,
    user: RequestUser,
    dto: { userId?: string; email?: string; roleInProject?: ProjectRole },
  ): Promise<ProjectMemberDto> {
    await this.ensureMember(projectId, user.id);
    if (!(await this.isProjectAdminOrSupervisor(projectId, user))) {
      throw new AppError(
        ErrorCodes.FORBIDDEN,
        'Solo un admin o supervisor de proyecto puede añadir miembros',
        403,
      );
    }

    if ((dto.userId && dto.email) || (!dto.userId && !dto.email)) {
      throw new AppError(
        ErrorCodes.INVITE_TARGET_AMBIGUOUS,
        'Debes indicar exactamente uno de `userId` o `email`',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const roleInProject: ProjectRole = dto.roleInProject ?? 'operador';

    // Un supervisor no puede otorgar el rol de admin de proyecto.
    const actorRole = await this.resolveProjectRole(projectId, user.id);
    if (roleInProject === 'admin' && actorRole === 'supervisor') {
      throw new AppError(
        ErrorCodes.CANNOT_GRANT_PROJECT_ADMIN,
        'Un supervisor no puede otorgar el rol de admin de proyecto',
        403,
      );
    }

    const projectOrgId = await this.getProjectOrgId(projectId);

    const target = dto.userId
      ? await this.prisma.user.findUnique({ where: { id: dto.userId } })
      : await this.prisma.user.findUnique({ where: { email: dto.email! } });

    // No revelar existencia cross-org: mismo error para "no existe" o "otra org".
    if (!target || target.organizationId !== projectOrgId) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, 'Usuario a añadir no encontrado', 404);
    }

    // Idempotencia: si ya es miembro, devolvemos el existente (sin overwrites).
    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: target.id } },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    });
    if (existing) {
      return toProjectMemberDto(existing);
    }

    try {
      const row = await this.prisma.projectMember.create({
        data: {
          projectId,
          userId: target.id,
          roleInProject,
        },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      });
      return toProjectMemberDto(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(ErrorCodes.CONFLICT, 'El usuario ya es miembro del proyecto', 409);
      }
      throw err;
    }
  }

  /**
   * PATCH /projects/:id/members/:userId — cambia el rol de un miembro.
   * Autoriza admin de proyecto o supervisor (el supervisor no puede poner
   * `admin`). No permite dejar al proyecto sin admin (-> 409 LAST_PROJECT_ADMIN).
   */
  async updateMember(
    projectId: string,
    memberUserId: string,
    user: RequestUser,
    dto: { roleInProject: ProjectRole },
  ): Promise<ProjectMemberDto> {
    await this.ensureMember(projectId, user.id);
    if (!(await this.isProjectAdminOrSupervisor(projectId, user))) {
      throw new AppError(
        ErrorCodes.FORBIDDEN,
        'Solo un admin o supervisor de proyecto puede cambiar roles',
        403,
      );
    }

    const actorRole = await this.resolveProjectRole(projectId, user.id);
    if (dto.roleInProject === 'admin' && actorRole === 'supervisor') {
      throw new AppError(
        ErrorCodes.CANNOT_GRANT_PROJECT_ADMIN,
        'Un supervisor no puede otorgar el rol de admin de proyecto',
        403,
      );
    }

    const target = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: memberUserId } },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    });
    if (!target) {
      throw new AppError(ErrorCodes.NOT_PROJECT_MEMBER, 'El usuario no es miembro del proyecto', 403);
    }

    // Regla "no dejar el proyecto sin admin".
    if (target.roleInProject === 'admin' && dto.roleInProject !== 'admin') {
      const adminCount = await this.prisma.projectMember.count({
        where: { projectId, roleInProject: 'admin' },
      });
      if (adminCount <= 1) {
        throw new AppError(
          ErrorCodes.LAST_PROJECT_ADMIN,
          'No puedes dejar el proyecto sin un admin',
          409,
        );
      }
    }

    const row = await this.prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId: memberUserId } },
      data: { roleInProject: dto.roleInProject },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    });
    return toProjectMemberDto(row);
  }

  /** DELETE /projects/:id/members/:userId — quita miembro. */
  async removeMember(
    projectId: string,
    memberUserId: string,
    user: RequestUser,
  ): Promise<void> {
    await this.ensureMember(projectId, user.id);
    if (!(await this.isProjectAdminOrSupervisor(projectId, user))) {
      throw new AppError(
        ErrorCodes.FORBIDDEN,
        'Solo un admin o supervisor de proyecto puede quitar miembros',
        403,
      );
    }

    // No permitir eliminar al único admin del proyecto.
    const target = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: memberUserId } },
    });
    if (target?.roleInProject === 'admin') {
      const adminCount = await this.prisma.projectMember.count({
        where: { projectId, roleInProject: 'admin' },
      });
      if (adminCount <= 1) {
        throw new AppError(
          ErrorCodes.LAST_PROJECT_ADMIN,
          'No puedes eliminar al único admin del proyecto',
          409,
        );
      }
    }

    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId: memberUserId } },
    });
  }

  /**
   * GET /projects/:id/candidates?q= — usuarios de la MISMA org del proyecto que
   * aún NO son miembros y cuyo name/email coincide con `q`. Autocompletado
   * seguro: el filtro de org es obligatorio (no se puede sugerir cross-org).
   */
  async candidates(
    projectId: string,
    q: string | undefined,
    userId: string,
  ): Promise<OrganizationMemberDto[]> {
    await this.ensureMember(projectId, userId);
    const projectOrgId = await this.getProjectOrgId(projectId);

    const rows = await this.prisma.user.findMany({
      where: {
        organizationId: projectOrgId,
        NOT: { projectMembers: { some: { projectId } } },
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    return rows.map(toOrganizationMemberDto);
  }
}
