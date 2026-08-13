import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {ValidationPipe} from '@nestjs/common';
import type {Express} from 'express';
import type {IncomingMessage, ServerResponse} from 'http';
import {AppModule} from './app.module';
import {AllExceptionsFilter} from './common/filters/all-exceptions.filter';
import {ResponseTransformInterceptor} from './common/interceptors/response-transform.interceptor';

/**
 * Handler para Vercel serverless (free tier).
 *
 * En Vercel el default export recibe (req, res) de Node directamente. La
 * instancia Express de Nest (`getHttpAdapter().getInstance()`) es ella misma un
 * listener (req, res), así que la cacheamos por container y la invocamos.
 * Esto evita dependencias de adaptadores AWS y funciona de forma nativa.
 */
let cachedApp: Express | undefined;

async function bootstrap(): Promise<Express> {
  const app = await NestFactory.create(AppModule, {logger: ['error', 'warn']});
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseTransformInterceptor());
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  await app.init();
  return app.getHttpAdapter().getInstance();
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!cachedApp) {
    cachedApp = await bootstrap();
  }
  return cachedApp(req, res);
}
