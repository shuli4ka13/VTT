import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema.ts';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS published_systems (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, owner_id TEXT NOT NULL,
  data TEXT NOT NULL, published_data TEXT,
  status TEXT NOT NULL DEFAULT 'draft', updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS published_compendiums (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, owner_id TEXT NOT NULL,
  system_id TEXT NOT NULL, data TEXT NOT NULL, published_data TEXT,
  status TEXT NOT NULL DEFAULT 'draft', updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, owner_id TEXT NOT NULL,
  system_id TEXT NOT NULL, compendium_ids TEXT NOT NULL,
  sheets TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, world_id TEXT NOT NULL,
  system TEXT NOT NULL, compendium TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS room_sheets (
  room_id TEXT NOT NULL, sheet_id TEXT NOT NULL, data TEXT NOT NULL,
  PRIMARY KEY (room_id, sheet_id));
CREATE TABLE IF NOT EXISTS room_clocks (
  room_id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS room_places (
  room_id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS room_rules (
  room_id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS room_pending (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members (
  room_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
  sheet_id TEXT, items INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (room_id, user_id));
CREATE TABLE IF NOT EXISTS log_entries (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL, at TEXT NOT NULL,
  text TEXT NOT NULL, lines TEXT, seq INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS log_by_room ON log_entries (room_id, seq);
CREATE TABLE IF NOT EXISTS room_journal (
  room_id TEXT NOT NULL, seq INTEGER NOT NULL, at TEXT NOT NULL, user_id TEXT NOT NULL,
  op TEXT NOT NULL, input TEXT NOT NULL, dice TEXT NOT NULL, result TEXT NOT NULL,
  PRIMARY KEY (room_id, seq));
`;

export interface Database {
  drizzle: Db;
  raw: DatabaseSync;
  close(): void;
}

function addStatusColumn(raw: DatabaseSync, table: string): void {
  const columns = raw.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.some(column => column.name === 'status')) return;
  raw.exec(`ALTER TABLE ${table} ADD COLUMN status TEXT NOT NULL DEFAULT 'published'`);
}

function addSnapshotColumn(raw: DatabaseSync, table: string): void {
  const columns = raw.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.some(column => column.name === 'published_data')) return;
  raw.exec(`ALTER TABLE ${table} ADD COLUMN published_data TEXT`);
  raw.exec(`UPDATE ${table} SET published_data = data WHERE status = 'published'`);
}

function addHiddenColumn(raw: DatabaseSync): void {
  const columns = raw.prepare('PRAGMA table_info(log_entries)').all() as { name: string }[];
  if (columns.some(column => column.name === 'hidden')) return;
  raw.exec('ALTER TABLE log_entries ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0');
}

function addLinesColumn(raw: DatabaseSync): void {
  const columns = raw.prepare('PRAGMA table_info(log_entries)').all() as { name: string }[];
  if (columns.some(column => column.name === 'lines')) return;
  raw.exec('ALTER TABLE log_entries ADD COLUMN lines TEXT');
}

function addItemsColumn(raw: DatabaseSync): void {
  const columns = raw.prepare('PRAGMA table_info(members)').all() as { name: string }[];
  if (columns.some(column => column.name === 'items')) return;
  raw.exec('ALTER TABLE members ADD COLUMN items INTEGER NOT NULL DEFAULT 0');
}

export function openDatabase(file = ':memory:'): Database {
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec(DDL);
  addStatusColumn(raw, 'published_systems');
  addStatusColumn(raw, 'published_compendiums');
  addSnapshotColumn(raw, 'published_systems');
  addSnapshotColumn(raw, 'published_compendiums');
  addHiddenColumn(raw);
  addLinesColumn(raw);
  addItemsColumn(raw);

  const db = drizzle<typeof schema>(async (sql, params, method) => {
    const statement = raw.prepare(sql);

    if (method === 'run') {
      statement.run(...(params as never[]));
      return { rows: [] };
    }

    const rows = statement.all(...(params as never[])) as Record<string, unknown>[];
    const asArrays = rows.map(row => Object.values(row));
    return { rows: method === 'get' ? (asArrays[0] ?? []) : asArrays };
  }, { schema });

  return { drizzle: db, raw, close: () => raw.close() };
}
