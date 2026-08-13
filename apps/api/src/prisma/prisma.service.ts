import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  BeforeApplicationShutdown,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Servicio Prisma global. En serverless se reutiliza la instancia por container
 * (cold start abre la conexión; warm reusa). DATABASE_URL ya usa pooler de Neon
 * con connection_limit=1.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy, BeforeApplicationShutdown
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
