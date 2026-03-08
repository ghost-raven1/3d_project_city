import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function parseCorsOrigin(raw: string | undefined): string[] | '*' {
  const normalized = (raw ?? '*').trim();
  if (!normalized || normalized === '*') {
    return '*';
  }

  const list = normalized
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return list.length > 0 ? list : '*';
}

function assertCorsForProduction(
  nodeEnv: string,
  corsOrigin: string[] | '*',
  wsCorsOrigin: string[] | '*',
): void {
  if (nodeEnv !== 'production') {
    return;
  }

  if (corsOrigin === '*' || wsCorsOrigin === '*') {
    throw new Error(
      'CORS_ORIGIN and WS_CORS_ORIGIN must be explicit in production (wildcard is not allowed).',
    );
  }
}

async function bootstrap() {
  const nodeEnv = (process.env.NODE_ENV ?? 'development').toLowerCase();
  const corsOrigin = parseCorsOrigin(process.env.CORS_ORIGIN);
  const wsCorsOrigin = parseCorsOrigin(process.env.WS_CORS_ORIGIN);
  assertCorsForProduction(nodeEnv, corsOrigin, wsCorsOrigin);

  const app = await NestFactory.create(AppModule);
  const httpAdapter = app.getHttpAdapter();
  const adapterInstance = httpAdapter?.getInstance?.();
  if (
    adapterInstance &&
    typeof adapterInstance === 'object' &&
    'disable' in adapterInstance &&
    typeof (adapterInstance as { disable?: unknown }).disable === 'function'
  ) {
    (adapterInstance as { disable: (name: string) => void }).disable(
      'x-powered-by',
    );
  }

  app.enableCors({
    origin: corsOrigin,
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
