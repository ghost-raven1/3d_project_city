import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const sqlitePath = process.env.SQLITE_PATH ?? './data/repositories.sqlite';
  const sqliteDirectory = path.dirname(sqlitePath);
  mkdirSync(sqliteDirectory, { recursive: true });

  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.listen(Number(process.env.PORT ?? 3000));
}

void bootstrap();
