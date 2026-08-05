// Хранилище стенда: встроенный node:sqlite, ноль зависимостей — в духе проекта.
//
// Схема повторяет референс-архитектуру в миниатюре:
//   миры       — то, что публикует автор (JSON целиком);
//   комнаты    — КОПИЯ мира на партию (система+компендиум снапшотом);
//   листы      — по одному ряду на чарник комнаты: их мутируют ходы;
//   конверты   — append-only журнал комнаты с порядковым номером;
//   участники  — кто в комнате, в какой роли, за каким листом.
//
// Истина стенда — таблицы листов; журнал пишется рядом. В полноценной версии
// наоборот: журнал — источник правды, листы — проекция (см. план и развилку
// №1 из ресерча). Для стенда выбран простой путь сознательно.

import { DatabaseSync } from 'node:sqlite';

export function openStore(path = 'server/stand.db') {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS worlds (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, world_id TEXT NOT NULL,
      system TEXT NOT NULL, compendium TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS room_sheets (
      room_id TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY (room_id, id));
    CREATE TABLE IF NOT EXISTS members (
      room_id TEXT NOT NULL, user TEXT NOT NULL, role TEXT NOT NULL,
      sheet_id TEXT,
      PRIMARY KEY (room_id, user));
    CREATE TABLE IF NOT EXISTS envelopes (
      room_id TEXT NOT NULL, seq INTEGER NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY (room_id, seq));
  `);
  return db;
}
