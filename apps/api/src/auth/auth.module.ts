import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AgentGuard } from '../common/guards/agent.guard';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

/**
 * Módulo de autenticación/autorización de la API.
 *
 * - Registra JwtModule con el secret `AUTH_SECRET` (el mismo que usa Auth.js).
 * - Provee y exporta los guards (JwtAuthGuard + RolesGuard/AdminGuard/AgentGuard)
 *   para que los feature modules los usen vía `@UseGuards` importando AuthModule.
 * - Expone `AuthController` (registro/login por credenciales, rutas públicas).
 * - Rate-limit básico para /auth/* (fuerza bruta/enumeración).
 */
@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.AUTH_SECRET,
      signOptions: { algorithm: 'HS256' },
      verifyOptions: { algorithms: ['HS256'] },
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'auth', ttl: 60_000, limit: 10 }],
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [JwtAuthGuard, RolesGuard, AdminGuard, AgentGuard, AuthService],
  exports: [JwtAuthGuard, RolesGuard, AdminGuard, AgentGuard, JwtModule],
})
export class AuthModule {}
