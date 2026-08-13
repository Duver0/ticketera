import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { RequestUser, SessionUser } from '@ticketera/types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UsersService } from './users.service';
import { UpdateUserRoleDto } from './dto/users.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** POST /users/sync — asegura la fila User y devuelve el perfil con rol. */
  @Post('sync')
  sync(@CurrentUser() user: RequestUser): Promise<SessionUser> {
    return this.users.sync(user);
  }

  /** GET /users/me — perfil propio. */
  @Get('me')
  me(@CurrentUser() user: RequestUser): Promise<SessionUser> {
    return this.users.me(user);
  }

  /** GET /users — lista completa (solo admin). */
  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin')
  findAll(): Promise<SessionUser[]> {
    return this.users.findAll();
  }

  /** GET /users/:id — un usuario (solo admin). */
  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  findOne(@Param('id') id: string): Promise<SessionUser> {
    return this.users.findOne(id);
  }

  /** PATCH /users/:id/role — cambia el rol global (solo admin). */
  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles('admin')
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ): Promise<SessionUser> {
    return this.users.updateRole(id, dto.role);
  }
}
