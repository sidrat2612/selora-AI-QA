import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { applyRequestContext } from './common/request-context.middleware';

export async function createApp() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api/v1');
  app.use(applyRequestContext);
  app.use(cookieParser());
  app.enableCors({
    origin: process.env['WEB_ORIGIN'] ?? 'http://localhost:3000',
    credentials: true,
  });

  return app;
}