import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

/**
 * Módulo de organizaciones (alcance por org). La autorización/pertenencia se
 * resuelve en el service; el controller solo aplica JwtAuthGuard.
 */
@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
