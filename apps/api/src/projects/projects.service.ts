import { Injectable } from '@nestjs/common';
import type {
  ProjectDto,
  ProjectMemberDto,
  ProjectRole,
  RequestUser,
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

/**
 * Lógica de proyectos y membresías.
 * La autorización por proyecto (`roleInProject` / admin global) se valida aquí,
 * no solo con el rol global.
 */
@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lanza NOT_PROJECT_MEMBER si el usuario no es miembro del proyecto. */
  private async ensureMember(
    projectId: string,
    userId: string,
  ): Promise<void> {
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

  /** POST /projects — crea proyecto y deja al creador como owner (admin). */
  async create(dto: { key: string; name: string; description?: string }, user: RequestUser): Promise<ProjectDto> {
    const key = dto.key.trim().toUpperCase();
    try {
      const project = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const created = await tx.project.create({
          data: {
            key,
            name: dto.name,
            description: dto.description,
            createdById: user.id,
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

  /** POST /projects/:id/members — añade miembro (admin proyecto o global). */
  async addMember(
    projectId: string,
    user: RequestUser,
    dto: { userId: string; roleInProject: ProjectRole },
  ): Promise<ProjectMemberDto> {
    await this.ensureMember(projectId, user.id);
    if (!(await this.isProjectAdmin(projectId, user))) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Solo un admin de proyecto puede añadir miembros', 403);
    }
    const target = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!target) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, 'Usuario a añadir no encontrado', 404);
    }
    try {
      const row = await this.prisma.projectMember.create({
        data: {
          projectId,
          userId: dto.userId,
          roleInProject: dto.roleInProject,
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

  /** DELETE /projects/:id/members/:userId — quita miembro (admin proyecto o global). */
  async removeMember(projectId: string, memberUserId: string, user: RequestUser): Promise<void> {
    await this.ensureMember(projectId, user.id);
    if (!(await this.isProjectAdmin(projectId, user))) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Solo un admin de proyecto puede quitar miembros', 403);
    }
    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId: memberUserId } },
    });
  }
}
