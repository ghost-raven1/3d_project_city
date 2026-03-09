import { QueryInterface } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  SequelizeStorage,
  Umzug,
} from 'umzug';
import {
  down as downInitialSchema,
  name as initialSchemaName,
  up as upInitialSchema,
} from './migrations/20260309170000-initial-schema';

interface DatabaseConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

interface MigrationParams {
  context: QueryInterface;
}

interface MigrationDefinition {
  name: string;
  up: (params: MigrationParams) => Promise<void>;
  down: (params: MigrationParams) => Promise<void>;
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

function createMigrationSequelize(): Sequelize {
  const nodeEnv = (process.env.NODE_ENV ?? 'development').toLowerCase();
  const dbSsl = envBool('DB_SSL', nodeEnv === 'production');
  const dbSslRejectUnauthorized = envBool(
    'DB_SSL_REJECT_UNAUTHORIZED',
    nodeEnv === 'production',
  );
  const dbConnection = resolveDatabaseConnection();

  return new Sequelize({
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
    logging: false,
  });
}

function createMigrations(): MigrationDefinition[] {
  return [
    {
      name: initialSchemaName,
      up: upInitialSchema,
      down: downInitialSchema,
    },
  ];
}

async function withUmzug<T>(task: (umzug: Umzug) => Promise<T>): Promise<T> {
  const sequelize = createMigrationSequelize();
  await sequelize.authenticate();
  const queryInterface = sequelize.getQueryInterface();
  const migrations = createMigrations();

  const umzug = new Umzug({
    migrations: migrations.map((migration) => ({
      name: migration.name,
      up: async () => migration.up({ context: queryInterface }),
      down: async () => migration.down({ context: queryInterface }),
    })),
    storage: new SequelizeStorage({ sequelize }),
    logger: console,
  });

  try {
    return await task(umzug);
  } finally {
    await sequelize.close();
  }
}

export function shouldAutoMigrate(): boolean {
  const nodeEnv = (process.env.NODE_ENV ?? 'development').toLowerCase();
  return envBool('DB_AUTO_MIGRATE', nodeEnv === 'production');
}

export async function runPendingMigrations(): Promise<string[]> {
  return withUmzug(async (umzug) => {
    const executed = await umzug.up();
    return executed.map((migration) => migration.name);
  });
}

export async function revertLastMigration(): Promise<string[]> {
  return withUmzug(async (umzug) => {
    const reverted = await umzug.down({ step: 1 });
    return reverted.map((migration) => migration.name);
  });
}

export async function getMigrationStatus(): Promise<{
  executed: string[];
  pending: string[];
}> {
  return withUmzug(async (umzug) => {
    const [executed, pending] = await Promise.all([
      umzug.executed(),
      umzug.pending(),
    ]);

    return {
      executed: executed.map((migration) => migration.name),
      pending: pending.map((migration) => migration.name),
    };
  });
}
