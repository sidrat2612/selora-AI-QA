import { Controller, Get } from '@nestjs/common';
import { success } from './common/response';
import { PrismaService } from './database/prisma.service';
import IORedis from 'ioredis';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  check() {
    return success({ status: 'ok', timestamp: new Date().toISOString() });
  }

  @Get('ready')
  async readiness() {
    const checks: Record<string, 'ok' | 'error'> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks['database'] = 'ok';
    } catch {
      checks['database'] = 'error';
    }

    try {
      const redisUrl = process.env['REDIS_URL'];
      if (!redisUrl) {
        checks['redis'] = process.env['NODE_ENV'] === 'production' ? 'error' : 'ok';
      } else {
        const parsed = new URL(redisUrl);
        const client = new IORedis({
          host: parsed.hostname,
          port: Number(parsed.port || '6379'),
          password: parsed.password || undefined,
          maxRetriesPerRequest: 1,
          lazyConnect: true,
        });
        await client.connect();
        await client.ping();
        await client.disconnect();
        checks['redis'] = 'ok';
      }
    } catch {
      checks['redis'] = 'error';
    }

    const allOk = Object.values(checks).every((status) => status === 'ok');

    return success({
      status: allOk ? 'ready' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    });
  }
}
