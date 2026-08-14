import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  OrganizationDto,
  OrganizationMemberDto,
  RequestUser,
  RotateInviteCodeResponseDto,
} from '@ticketera/types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto, JoinOrganizationDto } from './dto/organizations.dto';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  /** POST /organizations — crea org; el actor queda dueño. */
  @Post()
  @HttpCode(201)
  create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<OrganizationDto> {
    return this.orgs.create(dto, user);
  }

  /** POST /organizations/join — une al actor por código de invitación. */
  @Post('join')
  @HttpCode(200)
  join(
    @Body() dto: JoinOrganizationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<OrganizationDto> {
    return this.orgs.join(dto, user);
  }

  /** GET /organizations/me — la org del actor. */
  @Get('me')
  me(@CurrentUser() user: RequestUser): Promise<OrganizationDto> {
    return this.orgs.me(user);
  }

  /** GET /organizations/me/members — miembros de la org del actor. */
  @Get('me/members')
  myMembers(@CurrentUser() user: RequestUser): Promise<OrganizationMemberDto[]> {
    return this.orgs.myMembers(user);
  }

  /** POST /organizations/invite-code/rotate — regenera el código. */
  @Post('invite-code/rotate')
  @HttpCode(200)
  rotateInviteCode(@CurrentUser() user: RequestUser): Promise<RotateInviteCodeResponseDto> {
    return this.orgs.rotateInviteCode(user);
  }

  /** GET /organizations/:id — solo admin global o dueño de esa org. */
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<OrganizationDto> {
    return this.orgs.findOne(id, user);
  }
}
