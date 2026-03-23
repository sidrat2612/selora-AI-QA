import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { applyRequestContext } from './common/request-context.middleware';

function getAllowedWebOrigins() {
  const defaultOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'];
  const configuredOrigins = process.env['WEB_ORIGIN']
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configuredOrigins && configuredOrigins.length > 0
    ? [...new Set([...configuredOrigins, ...defaultOrigins])]
    : defaultOrigins;
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