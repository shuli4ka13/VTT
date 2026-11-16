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

export const publishedSystems = sqliteTable('published_systems', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  ownerId: text('owner_id').notNull(),
  data: text('data').notNull(),
  publishedData: text('published_data'),
  status: text('status').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const publishedCompendiums = sqliteTable('published_compendiums', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  ownerId: text('owner_id').notNull(),
  systemId: text('system_id').notNull(),
  data: text('data').notNull(),
  publishedData: text('published_data'),
  status: text('status').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const worlds = sqliteTable('worlds', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  ownerId: text('owner_id').notNull(),
  systemId: text('system_id').notNull(),
  compendiumIds: text('compendium_ids').notNull(),
  sheets: text('sheets').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  worldId: text('world_id').notNull(),
  system: text('system').notNull(),
  compendium: text('compendium').notNull(),
  createdAt: text('created_at').notNull(),
});

export const roomSheets = sqliteTable('room_sheets', {
  roomId: text('room_id').notNull(),
  sheetId: text('sheet_id').notNull(),
  data: text('data').notNull(),
});

export const roomClocks = sqliteTable('room_clocks', {
  roomId: text('room_id').primaryKey(),
  data: text('data').notNull(),
});

export const roomPlaces = sqliteTable('room_places', {
  roomId: text('room_id').primaryKey(),
  data: text('data').notNull(),
});

export const roomPending = sqliteTable('room_pending', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull(),
  data: text('data').notNull(),
});

export const roomJournal = sqliteTable('room_journal', {
  roomId: text('room_id').notNull(),
  seq: integer('seq').notNull(),
  at: text('at').notNull(),
  userId: text('user_id').notNull(),
  op: text('op').notNull(),
  input: text('input').notNull(),
  dice: text('dice').notNull(),
  result: text('result').notNull(),
});

export const members = sqliteTable('members', {
  roomId: text('room_id').notNull(),
  userId: text('user_id').notNull(),

  role: text('role').notNull(),
  sheetId: text('sheet_id'),
  items: integer('items').notNull().default(0),
});

export const logEntries = sqliteTable('log_entries', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull(),
  at: text('at').notNull(),
  text: text('text').notNull(),
  lines: text('lines'),
  seq: integer('seq').notNull(),
  hidden: integer('hidden').notNull().default(0),
});
