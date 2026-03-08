import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { CacheModule } from './cache/cache.module';
import { RepoCacheModel } from './cache/models/repo-cache.model';
import { GithubModule } from './github/github.module';
import { HealthModule } from './health/health.module';
import { LayoutModule } from './layout/layout.module';
import { ParserModule } from './parser/parser.module';
import { RepoModule } from './repo/repo.module';
import { RoomMessageModel } from './websocket/models/room-message.model';
import { RoomRegistryModel } from './websocket/models/room-registry.model';
import { WebsocketModule } from './websocket/websocket.module';

interface DatabaseConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.round(parsed);
}

function parseDatabaseUrl(databaseUrl: string): DatabaseConnectionConfig | null {
  try {
    const parsed = new URL(databaseUrl);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
      return null;
    }

    const databaseName = parsed.pathname.replace(/^\/+/, '').trim();
    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port ? envNumber('DB_PORT', Number(parsed.port)) : 5432,
      database: databaseName || 'repo_city',
      username: decodeURIComponent(parsed.username || 'postgres'),
      password: decodeURIComponent(parsed.password || 'postgres'),
    };
  } catch {
    return null;
  }
}

function resolveDatabaseConnection(): DatabaseConnectionConfig {
  const fromUrl = parseDatabaseUrl(
    process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/repo_city',
  );
  if (fromUrl) {
    return fromUrl;
  }

  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: envNumber('DB_PORT', 5432),
    database: process.env.DB_NAME ?? 'repo_city',
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
  };
}

function assertProductionDatabaseSafety(
  nodeEnv: string,
  synchronize: boolean,
  allowSyncInProduction: boolean,
): void {
  if (nodeEnv !== 'production') {
    return;
  }

  if (synchronize && !allowSyncInProduction) {
    throw new Error(
      'DB_SYNCHRONIZE=true is blocked in production. Set DB_ALLOW_SYNC_IN_PRODUCTION=true only for controlled maintenance.',
    );
  }
}

const nodeEnv = (process.env.NODE_ENV ?? 'development').toLowerCase();
const dbSynchronize = envBool('DB_SYNCHRONIZE', nodeEnv !== 'production');
const dbLogging = envBool('DB_LOGGING', false);
const dbSsl = envBool('DB_SSL', nodeEnv === 'production');
const dbSslRejectUnauthorized = envBool(
  'DB_SSL_REJECT_UNAUTHORIZED',
  nodeEnv === 'production',
);
const dbAllowSyncInProduction = envBool('DB_ALLOW_SYNC_IN_PRODUCTION', false);
const dbConnection = resolveDatabaseConnection();
assertProductionDatabaseSafety(
  nodeEnv,
  dbSynchronize,
  dbAllowSyncInProduction,
);

@Module({
  imports: [
    SequelizeModule.forRoot({
      dialect: 'postgres',
      host: dbConnection.host,
      port: dbConnection.port,
      database: dbConnection.database,
      username: dbConnection.username,
      password: dbConnection.password,
      ...(dbSsl
        ? {
            dialectOptions: {
              ssl: {
                require: true,
                rejectUnauthorized: dbSslRejectUnauthorized,
              },
            },
          }
        : {}),
      autoLoadModels: true,
      synchronize: dbSynchronize,
      models: [RepoCacheModel, RoomRegistryModel, RoomMessageModel],
      logging: dbLogging,
    }),
    CacheModule,
    GithubModule,
    HealthModule,
    LayoutModule,
    ParserModule,
    WebsocketModule,
    RepoModule,
  ],
})
export class AppModule {}
