import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { LoginDto, RegisterDto, SessionUser } from '@ticketera/types';
import { AuthService } from './auth.service';
import { LoginDto as LoginBody } from './dto/auth.dto';
import { RegisterDto as RegisterBody } from './dto/auth.dto';

/**
 * Endpoints públicos de autenticación por credenciales.
 * No usan JwtAuthGuard: cualquiera puede registrarse/iniciar sesión.
 * Rate-limit aplicado vía ThrottlerGuard + @Throttle('auth') (10 req/60s).
 * Las respuestas quedan envueltas por ResponseTransformInterceptor en { data }.
 */
@UseGuards(ThrottlerGuard)
@Throttle({ auth: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /api/v1/auth/register -> 201 + SessionUser */
  @Post('register')
  register(@Body() dto: RegisterBody): Promise<SessionUser> {
    return this.auth.register(dto as RegisterDto);
  }

  /** POST /api/v1/auth/login -> 200 + SessionUser */
  @Post('login')
  login(@Body() dto: LoginBody): Promise<SessionUser> {
    return this.auth.login(dto as LoginDto);
  }
}
