import { Controller, Get } from '@nestjs/common';

/** GET /api/v1/health — chequeo de salud (público). */
@Controller('health')
export class HealthController {
  @Get()
  health(): { ok: true } {
    return { ok: true };
  }
}
