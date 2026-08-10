// Контракты клиент ↔ сервер. Живут рядом со схемой мира и по той же причине:
// одно описание, из которого выведены типы обеих сторон.
//
// Главное здесь — НАМЕРЕНИЕ. Клиент не присылает результат хода («я снял
// 9 хитов»), он присылает просьбу: кто, каким действием, в кого. Разрешает
// её сервер движком и рассылает дельты. Это тот же принцип, что внутри
// конверта: отправитель не считает за получателя.

import { z } from 'zod';
import { system, compendium, sheet, world } from './world.ts';

// ── вход ────────────────────────────────────────────────────────────────

export const loginRequest = z.object({
  name: z.string().min(1).max(64),
});

export const session = z.object({
  userId: z.string(),
  name: z.string(),
  token: z.string(),
});

// ── миры ────────────────────────────────────────────────────────────────

export const publishRequest = z.object({
  title: z.string().min(1).max(120),
  world,
});

export const worldSummary = z.object({
  id: z.string(),
  title: z.string(),
  systemName: z.string(),
  authorName: z.string(),
  sheetCount: z.number().int().nonnegative(),
  updatedAt: z.string(),
});

// ── комнаты ─────────────────────────────────────────────────────────────

export const createRoomRequest = z.object({
  worldId: z.string(),
  title: z.string().min(1).max(120),
});

export const roomSummary = z.object({
  id: z.string(),
  title: z.string(),
  worldId: z.string(),
  memberCount: z.number().int().nonnegative(),
});

/** Полный срез комнаты: выдаётся при входе, дальше приходят только дельты. */
export const roomState = z.object({
  id: z.string(),
  title: z.string(),
  system,
  compendium,
  sheets: z.array(sheet),
  members: z.array(z.object({ userId: z.string(), name: z.string() })),
  log: z.array(z.object({
    id: z.string(),
    at: z.string(),
    text: z.string(),
  })),
});

// ── ход ─────────────────────────────────────────────────────────────────

/**
 * НАМЕРЕНИЕ, а не результат. Клиент просит — сервер считает движком
 * и рассылает дельты; иначе клиент диктовал бы урон, и это был бы чит,
 * а не игра.
 */
export const actIntent = z.object({
  roomId: z.string(),
  actionId: z.string().min(1),
  fromId: z.string().min(1),
  toId: z.string().min(1),
});

/** Дельта: изменившиеся листы плюс строки журнала. Полный срез не гоняем. */
export const roomDelta = z.object({
  roomId: z.string(),
  sheets: z.array(sheet),
  log: z.array(z.object({
    id: z.string(),
    at: z.string(),
    text: z.string(),
  })),
});

// ── сообщения канала ────────────────────────────────────────────────────

export const serverMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room:state'), state: roomState }),
  z.object({ type: z.literal('room:delta'), delta: roomDelta }),
  z.object({ type: z.literal('room:members'), members: z.array(z.object({
    userId: z.string(), name: z.string(),
  })) }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);

export const clientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room:join'), roomId: z.string(), token: z.string() }),
  z.object({ type: z.literal('room:act'), intent: actIntent }),
  z.object({ type: z.literal('sheet:set'), roomId: z.string(), sheetId: z.string(), tag: z.string(), value: z.union([z.number(), z.string(), z.boolean(), z.null()]) }),
  // Лист заводит ПАРТИЯ в комнате: мир волен приезжать вообще без листов.
  z.object({ type: z.literal('sheet:create'), roomId: z.string(), name: z.string().min(1).max(64), kind: z.enum(['pc', 'npc']).optional() }),
  // Принадлежности: надеть/снять предмет, выучить/забыть действие, повесить/снять
  // эффект. Всегда ССЫЛКА на объявленное — нового лист не вводит.
  z.object({
    type: z.literal('sheet:belong'),
    roomId: z.string(),
    sheetId: z.string(),
    list: z.enum(['equipped', 'actions', 'effects']),
    id: z.string().min(1),
    on: z.boolean(),
  }),
]);

export type LoginRequest = z.infer<typeof loginRequest>;
export type Session = z.infer<typeof session>;
export type PublishRequest = z.infer<typeof publishRequest>;
export type WorldSummary = z.infer<typeof worldSummary>;
export type CreateRoomRequest = z.infer<typeof createRoomRequest>;
export type RoomSummary = z.infer<typeof roomSummary>;
export type RoomState = z.infer<typeof roomState>;
export type ActIntent = z.infer<typeof actIntent>;
export type RoomDelta = z.infer<typeof roomDelta>;
export type ServerMessage = z.infer<typeof serverMessage>;
export type ClientMessage = z.infer<typeof clientMessage>;
