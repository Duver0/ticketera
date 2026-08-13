import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AgentGuard } from '../common/guards/agent.guard';

/**
 * Módulo de autenticación/autorización de la API.
 *
 * - Registra JwtModule con el secret `AUTH_SECRET` (el mismo que usa Auth.js).
 * - Provee y exporta los guards (JwtAuthGuard + RolesGuard/AdminGuard/AgentGuard)
 *   para que los feature modules los usen vía `@UseGuards` importando AuthModule.
 *
 * No se exponen controllers: la creación/sincronización de la fila User la hace
 * UsersModule (`POST /users/sync`).
 */
@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.AUTH_SECRET,
      signOptions: { algorithm: 'HS256' },
      verifyOptions: { algorithms: ['HS256'] },
    }),
  ],
  providers: [JwtAuthGuard, RolesGuard, AdminGuard, AgentGuard],
  exports: [JwtAuthGuard, RolesGuard, AdminGuard, AgentGuard, JwtModule],
})
export class AuthModule {}
