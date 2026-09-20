import { z } from 'zod';
import { system, compendium, sheet } from './world.ts';

export const loginRequest = z.object({
  name: z.string().min(1).max(64),
});

export const session = z.object({
  userId: z.string(),
  name: z.string(),
  token: z.string(),
});

export const savedRef = z.object({ id: z.string(), updatedAt: z.string() });

export const publishSystemRequest = z.object({
  title: z.string().min(1).max(120),
  system,

  since: z.string().optional(),
});

export const publishState = z.enum(['draft', 'published']);

export const systemSummary = z.object({
  id: z.string(), title: z.string(), systemName: z.string(),
  authorName: z.string(), updatedAt: z.string(),
  status: publishState,
});

export const publishedSystem = z.object({
  id: z.string(), title: z.string(), updatedAt: z.string(), system,
});

export const publishCompendiumRequest = z.object({
  title: z.string().min(1).max(120),
  systemId: z.string().min(1),
  compendium,

  since: z.string().optional(),
});

export const compendiumSummary = z.object({
  id: z.string(), title: z.string(), systemId: z.string(),
  systemName: z.string(), authorName: z.string(),
  itemCount: z.number().int().nonnegative(), updatedAt: z.string(),
  status: publishState,
});

export const publishedCompendium = z.object({
  id: z.string(), title: z.string(), systemId: z.string(), updatedAt: z.string(), compendium,
});

export const publishRequest = z.object({
  title: z.string().min(1).max(120),
  systemId: z.string().min(1),
  compendiumIds: z.array(z.string().min(1)),
  sheets: z.array(sheet),
});

export const worldSummary = z.object({
  id: z.string(),
  title: z.string(),
  systemName: z.string(),
  compendiumCount: z.number().int().nonnegative(),
  authorName: z.string(),
  sheetCount: z.number().int().nonnegative(),
  updatedAt: z.string(),
});

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

export const pendingState = z.object({
  id: z.string(),
  sheetId: z.string(),
  stage: z.enum(['sender', 'target']),
  question: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string() })),
  preview: z.array(z.string()),
});

export const answerIntent = z.object({
  roomId: z.string(),
  pendingId: z.string().min(1),
  chosen: z.array(z.string().min(1)),
});

export const clockState = z.object({
  round: z.number().int().nonnegative(),
  order: z.array(z.string()),
  active: z.string().nullable(),
  spent: z.record(z.string(), z.record(z.string(), z.number().int().nonnegative())),
});

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

  clock: clockState.optional(),
  pending: pendingState.nullable().optional(),
});

export const turnIntent = z.object({
  roomId: z.string(),
  op: z.enum(['start', 'next', 'stop', 'scene']),
  order: z.array(z.string().min(1)).optional(),
});

export const actIntent = z.object({
  roomId: z.string(),
  actionId: z.string().min(1),
  fromId: z.string().min(1),
  toId: z.string().min(1),

  toIds: z.array(z.string().min(1)).optional(),

  edits: z.array(z.string().min(1)).optional(),
  targetEdits: z.array(z.string().min(1)).optional(),

  inputs: z.record(z.string().min(1), z.union([z.number(), z.string()])).optional(),
});

export const roomDelta = z.object({
  roomId: z.string(),
  sheets: z.array(sheet),
  log: z.array(z.object({
    id: z.string(),
    at: z.string(),
    text: z.string(),
  })),

  clock: clockState.optional(),
  pending: pendingState.nullable().optional(),
});

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
  z.object({ type: z.literal('room:turn'), intent: turnIntent }),
  z.object({ type: z.literal('room:answer'), intent: answerIntent }),
  z.object({ type: z.literal('sheet:set'), roomId: z.string(), sheetId: z.string(), tag: z.string(), value: z.union([z.number(), z.string(), z.boolean(), z.null()]) }),

  z.object({ type: z.literal('sheet:create'), roomId: z.string(), name: z.string().min(1).max(64), kind: z.enum(['pc', 'npc']).optional() }),

  z.object({ type: z.literal('sheet:roll'), roomId: z.string(), sheetId: z.string(), tag: z.string().min(1) }),

  z.object({ type: z.literal('sheet:claim'), roomId: z.string(), sheetId: z.string().nullable() }),

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
export type PublishSystemRequest = z.infer<typeof publishSystemRequest>;
export type SystemSummary = z.infer<typeof systemSummary>;
export type PublishedSystem = z.infer<typeof publishedSystem>;
export type PublishCompendiumRequest = z.infer<typeof publishCompendiumRequest>;
export type CompendiumSummary = z.infer<typeof compendiumSummary>;
export type PublishState = z.infer<typeof publishState>;
export type SavedRef = z.infer<typeof savedRef>;
export type PublishedCompendium = z.infer<typeof publishedCompendium>;
export type PublishRequest = z.infer<typeof publishRequest>;
export type WorldSummary = z.infer<typeof worldSummary>;
export type CreateRoomRequest = z.infer<typeof createRoomRequest>;
export type RoomSummary = z.infer<typeof roomSummary>;
export type RoomState = z.infer<typeof roomState>;
export type ActIntent = z.infer<typeof actIntent>;
export type ClockState = z.infer<typeof clockState>;
export type PendingState = z.infer<typeof pendingState>;
export type AnswerIntent = z.infer<typeof answerIntent>;
export type TurnIntent = z.infer<typeof turnIntent>;
export type RoomDelta = z.infer<typeof roomDelta>;
export type ServerMessage = z.infer<typeof serverMessage>;
export type ClientMessage = z.infer<typeof clientMessage>;
