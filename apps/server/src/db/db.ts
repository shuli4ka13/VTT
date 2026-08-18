// Подключение к БД: Drizzle поверх ВСТРОЕННОГО в Node SQLite.
//
// Готового адаптера под `node:sqlite` у Drizzle нет, зато есть `sqlite-proxy`:
// он спрашивает у нас выполнить готовый SQL. Это дороже одной строчки настройки,
// но снимает нативную сборку целиком — сервер ставится и запускается там, где
// нет ни компилятора, ни python. За это же и держимся: меньше движущихся частей.

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
  data TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS published_compendiums (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, owner_id TEXT NOT NULL,
  system_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL);
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
CREATE TABLE IF NOT EXISTS members (
  room_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
  sheet_id TEXT, PRIMARY KEY (room_id, user_id));
CREATE TABLE IF NOT EXISTS log_entries (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL, at TEXT NOT NULL,
  text TEXT NOT NULL, seq INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS log_by_room ON log_entries (room_id, seq);
`;

export interface Database {
  drizzle: Db;
  raw: DatabaseSync;
  close(): void;
}

export function openDatabase(file = ':memory:'): Database {
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec(DDL);

  const db = drizzle<typeof schema>(async (sql, params, method) => {
    const statement = raw.prepare(sql);

    // `run` — запросы без результата; всё остальное обязано вернуть СТРОКИ
    // МАССИВАМИ значений: именно так их ждёт sqlite-proxy, и именно на этом
    // ломается наивная реализация, отдающая объекты.
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
