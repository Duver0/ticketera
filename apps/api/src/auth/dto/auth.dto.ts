import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body de POST /auth/register.
 * Validación mínima en el DTO (contrato de entrada); la regla de
 * "al menos una letra y un dígito" se valida en el servicio y lanza
 * `WEAK_PASSWORD` explícito. La creación/unión a organización
 * (organizationSlug/inviteCode) se valida en el servicio (formato, unicidad,
 * exclusión mutua) y lanza los códigos ORG_* / INVITE_CODE_INVALID.
 */
export class RegisterDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  /** (a) Crear organización con este slug (queda dueño). */
  @IsOptional()
  @IsString()
  organizationSlug?: string;

  /** (b) Unirse a una organización por código de invitación. */
  @IsOptional()
  @IsString()
  inviteCode?: string;
}

/**
 * Body de POST /auth/login.
 */
export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
