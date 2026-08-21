import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env } from '../config/env';
import { child } from '../lib/logger';

const log = child('db');

let instance: Database.Database | null = null;

export const getDb = (): Database.Database => {
  if (instance) return instance;

  fs.mkdirSync(path.dirname(env.db.path), { recursive: true });
  const db = new Database(env.db.path);

  // WAL keeps the price watcher's writes from blocking bot reads.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  instance = db;
  log.debug({ path: env.db.path }, 'sqlite opened');
  return db;
};

export const closeDb = (): void => {
  instance?.close();
  instance = null;
};

/** Wrap a unit of work in a transaction; nested calls reuse the outer one. */
export const transaction = <T>(fn: () => T): T => getDb().transaction(fn)();
