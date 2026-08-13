import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  ProjectDto,
  ProjectMemberDto,
  RequestUser,
} from '@ticketera/types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ProjectsService } from './projects.service';
import { AddProjectMemberDto, CreateProjectDto, UpdateProjectDto } from './dto/projects.dto';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: RequestUser): Promise<ProjectDto> {
    return this.projects.create(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: RequestUser): Promise<ProjectDto[]> {
    return this.projects.findAll(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<ProjectDto> {
    return this.projects.findOne(id, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ProjectDto> {
    return this.projects.update(id, user, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<void> {
    return this.projects.remove(id, user);
  }

  @Get(':id/members')
  listMembers(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ProjectMemberDto[]> {
    return this.projects.listMembers(id, user.id);
  }

  @Post(':id/members')
  @HttpCode(201)
  addMember(
    @Param('id') id: string,
    @Body() dto: AddProjectMemberDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ProjectMemberDto> {
    return this.projects.addMember(id, user, dto);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.projects.removeMember(id, userId, user);
  }
}
