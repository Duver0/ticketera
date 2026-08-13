import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body de POST /auth/register.
 * Validación mínima en el DTO (contrato de entrada); la regla de
 * "al menos una letra y un dígito" se valida en el servicio y lanza
 * `WEAK_PASSWORD` explícito (ver docs/auth-design.md §6).
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
