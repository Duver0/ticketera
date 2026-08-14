import { IsOptional, IsString, Length } from 'class-validator';

/** POST /organizations */
export class CreateOrganizationDto {
  @IsString()
  @Length(3, 40)
  slug!: string;

  /** Solo admin global; si se omite, el actor queda como dueño. */
  @IsOptional()
  @IsString()
  ownerId?: string;
}

/** POST /organizations/join */
export class JoinOrganizationDto {
  @IsString()
  inviteCode!: string;
}
