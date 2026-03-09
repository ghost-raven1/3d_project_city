import {
  getMigrationStatus,
  revertLastMigration,
  runPendingMigrations,
} from '../database/migrator';

type MigrationCommand = 'up' | 'down' | 'status';

function parseCommand(value: string | undefined): MigrationCommand {
  if (value === 'down' || value === 'status') {
    return value;
  }

  return 'up';
}

async function runUp(): Promise<void> {
  const applied = await runPendingMigrations();
  if (applied.length === 0) {
    console.log('[migrate] no pending migrations');
    return;
  }

  console.log(`[migrate] applied (${applied.length}): ${applied.join(', ')}`);
}

async function runDown(): Promise<void> {
  const reverted = await revertLastMigration();
  if (reverted.length === 0) {
    console.log('[migrate] no executed migrations to revert');
    return;
  }

  console.log(`[migrate] reverted (${reverted.length}): ${reverted.join(', ')}`);
}

async function runStatus(): Promise<void> {
  const { executed, pending } = await getMigrationStatus();
  console.log(`[migrate] executed (${executed.length}): ${executed.join(', ') || '-'}`);
  console.log(`[migrate] pending (${pending.length}): ${pending.join(', ') || '-'}`);
}

async function main(): Promise<void> {
  const command = parseCommand(process.argv[2]);

  if (command === 'status') {
    await runStatus();
    return;
  }

  if (command === 'down') {
    await runDown();
    return;
  }

  await runUp();
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[migrate][error] ${message}`);
  process.exitCode = 1;
});
