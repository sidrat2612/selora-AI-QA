import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { applyRequestContext } from './common/request-context.middleware';

function getAllowedWebOrigins() {
  const isProduction = process.env['NODE_ENV'] === 'production';
  const configuredOrigins = process.env['WEB_ORIGIN']
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins && configuredOrigins.length > 0) {
    return isProduction
      ? configuredOrigins
      : [...new Set([...configuredOrigins, 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'])];
  }

  if (isProduction) {
    throw new Error('WEB_ORIGIN must be set in production (e.g. https://app.seloraqa.com)');
  }

  return ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'];
}

export async function createApp() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api/v1');
  app.use(applyRequestContext);
  app.use(cookieParser());
  app.enableCors({
    origin: getAllowedWebOrigins(),
    credentials: true,
  });

  return app;
}