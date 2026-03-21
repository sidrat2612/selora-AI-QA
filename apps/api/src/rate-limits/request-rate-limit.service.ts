import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import type { Response } from 'express';
import { tooManyRequests } from '../common/http-errors';
import type { AppRequest, RequestAuthContext } from '../common/types';
import { PrismaService } from '../database/prisma.service';

type RateLimitWindow = {
  limit: number;
  remaining: number;
  resetAt: number;
};

const WINDOW_MS = 60_000;
const DEFAULT_USER_LIMIT = 120;
const DEFAULT_TENANT_LIMIT = 600;

@Injectable()
export class RequestRateLimitService implements OnModuleDestroy {
  private readonly redisClient: Redis | null;
  private readonly fallbackWindows = new Map<string, number[]>();

  constructor(private readonly prisma: PrismaService) {
    this.redisClient = this.buildRedisClient();
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }

  async consumeAuthenticatedRequest(request: AppRequest, response: Response, auth: RequestAuthContext) {
    const tenantId = this.resolveTenantId(request, auth);
    const [tenantLimit, userLimit] = await Promise.all([
      this.getTenantLimit(tenantId),
      Promise.resolve(this.getUserLimit()),
    ]);

    const now = Date.now();
    const [userWindow, tenantWindow] = await Promise.all([
      this.consumeWindow(`user:${tenantId}:${auth.user.id}`, userLimit, now, request.requestId),
      this.consumeWindow(`tenant:${tenantId}`, tenantLimit, now, request.requestId),
    ]);
    const effectiveWindow = this.pickEffectiveWindow(userWindow, tenantWindow);

    response.setHeader('X-RateLimit-Limit', String(effectiveWindow.limit));
    response.setHeader('X-RateLimit-Remaining', String(Math.max(effectiveWindow.remaining, 0)));
    response.setHeader('X-RateLimit-Reset', String(Math.ceil(effectiveWindow.resetAt / 1000)));

    if (userWindow.remaining < 0 || tenantWindow.remaining < 0) {
      const retryAfterSeconds = Math.max(1, Math.ceil((effectiveWindow.resetAt - now) / 1000));
      response.setHeader('Retry-After', String(retryAfterSeconds));
      throw tooManyRequests(
        'RATE_LIMIT_EXCEEDED',
        'API rate limit exceeded for this tenant or user. Retry after the current window resets.',
        {
          tenantId,
          userId: auth.user.id,
          tenantLimit: tenantWindow.limit,
          userLimit: userWindow.limit,
          tenantRemaining: Math.max(tenantWindow.remaining, 0),
          userRemaining: Math.max(userWindow.remaining, 0),
          resetAt: new Date(effectiveWindow.resetAt).toISOString(),
        },
      );
    }
  }

  async getTenantRequestUsage(tenantId: string) {
    const limit = await this.getTenantLimit(tenantId);
    const snapshot = await this.peekWindow(`tenant:${tenantId}`, limit, Date.now());
    return Math.max(snapshot.limit - snapshot.remaining, 0);
  }

  private async getTenantLimit(tenantId: string) {
    const quota = await this.prisma.tenantQuota.findUnique({
      where: { tenantId_metricType: { tenantId, metricType: 'API_REQUESTS_PER_MINUTE' } },
      select: { limitValue: true },
    });

    return quota?.limitValue ? Math.max(1, Math.floor(quota.limitValue)) : this.getDefaultTenantLimit();
  }

  private getUserLimit() {
    const raw = Number(process.env['API_RATE_LIMIT_USER_PER_MINUTE'] ?? DEFAULT_USER_LIMIT);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_USER_LIMIT;
  }

  private getDefaultTenantLimit() {
    const raw = Number(process.env['API_RATE_LIMIT_TENANT_PER_MINUTE'] ?? DEFAULT_TENANT_LIMIT);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_TENANT_LIMIT;
  }

  private resolveTenantId(request: AppRequest, auth: RequestAuthContext) {
    const tenantIdParam = request.params?.['tenantId'];
    if (typeof tenantIdParam === 'string' && tenantIdParam.length > 0) {
      return tenantIdParam;
    }

    const workspaceId = request.params?.['workspaceId'];
    if (typeof workspaceId === 'string' && workspaceId.length > 0) {
      const membership = auth.user.memberships.find((item) => item.workspaceId === workspaceId);
      if (membership?.tenantId) {
        return membership.tenantId;
      }
    }

    if (auth.activeWorkspaceId) {
      const membership = auth.user.memberships.find((item) => item.workspaceId === auth.activeWorkspaceId);
      if (membership?.tenantId) {
        return membership.tenantId;
      }
    }

    return auth.user.memberships[0]?.tenantId ?? 'global';
  }

  private pickEffectiveWindow(userWindow: RateLimitWindow, tenantWindow: RateLimitWindow) {
    const userRatio = (userWindow.limit - Math.max(userWindow.remaining, 0)) / userWindow.limit;
    const tenantRatio = (tenantWindow.limit - Math.max(tenantWindow.remaining, 0)) / tenantWindow.limit;
    return userRatio >= tenantRatio ? userWindow : tenantWindow;
  }

  private async consumeWindow(key: string, limit: number, now: number, requestId: string) {
    if (this.redisClient) {
      return this.consumeRedisWindow(key, limit, now, requestId);
    }

    return this.consumeFallbackWindow(key, limit, now);
  }

  private async peekWindow(key: string, limit: number, now: number) {
    if (this.redisClient) {
      return this.peekRedisWindow(key, limit, now);
    }

    return this.peekFallbackWindow(key, limit, now);
  }

  private async consumeRedisWindow(key: string, limit: number, now: number, requestId: string) {
    const result = (await this.redisClient!.eval(
      `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local windowStart = tonumber(ARGV[2])
      local ttl = tonumber(ARGV[3])
      local limit = tonumber(ARGV[4])
      local member = ARGV[5]

      redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
      local count = redis.call('ZCARD', key)
      if count >= limit then
        local first = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
        local resetAt = now + ttl
        if first[2] ~= nil then
          resetAt = tonumber(first[2]) + ttl
        end
        redis.call('PEXPIRE', key, ttl)
        return {0, count, resetAt}
      end

      redis.call('ZADD', key, now, member)
      redis.call('PEXPIRE', key, ttl)
      local nextCount = count + 1
      local first = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local resetAt = now + ttl
      if first[2] ~= nil then
        resetAt = tonumber(first[2]) + ttl
      end
      return {1, nextCount, resetAt}
      `,
      1,
      this.buildRedisKey(key),
      String(now),
      String(now - WINDOW_MS),
      String(WINDOW_MS),
      String(limit),
      `${now}:${requestId}`,
    )) as [number, number, number];

    const allowed = result[0] === 1;
    const count = Number(result[1]);
    return {
      limit,
      remaining: allowed ? limit - count : limit - count - 1,
      resetAt: Number(result[2]),
    } satisfies RateLimitWindow;
  }

  private async peekRedisWindow(key: string, limit: number, now: number) {
    const result = (await this.redisClient!.eval(
      `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local windowStart = tonumber(ARGV[2])
      local ttl = tonumber(ARGV[3])

      redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
      local count = redis.call('ZCARD', key)
      local first = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local resetAt = now + ttl
      if first[2] ~= nil then
        resetAt = tonumber(first[2]) + ttl
      end
      redis.call('PEXPIRE', key, ttl)
      return {count, resetAt}
      `,
      1,
      this.buildRedisKey(key),
      String(now),
      String(now - WINDOW_MS),
      String(WINDOW_MS),
    )) as [number, number];

    const count = Number(result[0]);
    return {
      limit,
      remaining: limit - count,
      resetAt: Number(result[1]),
    } satisfies RateLimitWindow;
  }

  private consumeFallbackWindow(key: string, limit: number, now: number) {
    const window = this.pruneFallbackWindow(key, now);
    if (window.length >= limit) {
      return {
        limit,
        remaining: limit - window.length - 1,
        resetAt: (window[0] ?? now) + WINDOW_MS,
      } satisfies RateLimitWindow;
    }

    window.push(now);
    this.fallbackWindows.set(key, window);
    return {
      limit,
      remaining: limit - window.length,
      resetAt: (window[0] ?? now) + WINDOW_MS,
    } satisfies RateLimitWindow;
  }

  private peekFallbackWindow(key: string, limit: number, now: number) {
    const window = this.pruneFallbackWindow(key, now);
    return {
      limit,
      remaining: limit - window.length,
      resetAt: (window[0] ?? now) + WINDOW_MS,
    } satisfies RateLimitWindow;
  }

  private pruneFallbackWindow(key: string, now: number) {
    const existing = this.fallbackWindows.get(key) ?? [];
    const pruned = existing.filter((entry) => entry > now - WINDOW_MS);
    this.fallbackWindows.set(key, pruned);
    return pruned;
  }

  private buildRedisKey(key: string) {
    return `rate-limit:v1:${key}`;
  }

  private buildRedisClient() {
    const redisUrl = process.env['REDIS_URL'];
    if (!redisUrl) {
      return null;
    }

    const parsed = new URL(redisUrl);
    return new Redis({
      host: parsed.hostname,
      port: Number(parsed.port || '6379'),
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      maxRetriesPerRequest: null,
    });
  }
}