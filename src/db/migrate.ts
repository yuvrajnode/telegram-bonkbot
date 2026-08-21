import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './index';
import { child } from '../lib/logger';

const log = child('migrate');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export const runMigrations = (): void => {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db
      .prepare('SELECT name FROM schema_migrations')
      .all()
      .map((row) => (row as { name: string }).name),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const record = db.prepare('INSERT INTO schema_migrations (name) VALUES (?)');

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      record.run(file);
    })();
    log.info({ migration: file }, 'applied');
  }

  log.debug({ count: files.length }, 'schema up to date');
};

if (require.main === module) {
  runMigrations();
}
