// Схема БД. Реляционного здесь минимум: мир — документ, и хранится документом.
// Разносить систему по таблицам значило бы описать её форму дважды — один раз
// схемой мира, второй раз DDL, — и расходиться они начали бы на первой правке.

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: text('created_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  userId: text('user_id').notNull(),
  createdAt: text('created_at').notNull(),
});

/** Опубликованный мир. Автор — не роль из выпадашки, а владение. */
export const worlds = sqliteTable('worlds', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  ownerId: text('owner_id').notNull(),
  /** Весь мир одним JSON, валидируемым схемой на входе и выходе. */
  data: text('data').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** Комната — КОПИЯ мира: партия играет в свой экземпляр, публикация не мутирует. */
export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  worldId: text('world_id').notNull(),
  system: text('system').notNull(),
  compendium: text('compendium').notNull(),
  createdAt: text('created_at').notNull(),
});

/**
 * Чарники комнаты лежат построчно, а не одним блоком: ход правит один-два
 * листа, и переписывать ради этого весь мир — значит гонять по сети и по диску
 * данные, которых никто не спрашивал.
 */
export const roomSheets = sqliteTable('room_sheets', {
  roomId: text('room_id').notNull(),
  sheetId: text('sheet_id').notNull(),
  data: text('data').notNull(),
});

export const members = sqliteTable('members', {
  roomId: text('room_id').notNull(),
  userId: text('user_id').notNull(),
  /** Создатель комнаты — ведущий: роль из владения, а не из настройки. */
  role: text('role').notNull(),
  sheetId: text('sheet_id'),
});

export const logEntries = sqliteTable('log_entries', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull(),
  at: text('at').notNull(),
  text: text('text').notNull(),
  seq: integer('seq').notNull(),
});
