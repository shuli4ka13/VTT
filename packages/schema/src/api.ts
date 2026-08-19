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

export const publishSystemRequest = z.object({
  title: z.string().min(1).max(120),
  system,
});

export const systemSummary = z.object({
  id: z.string(), title: z.string(), systemName: z.string(),
  authorName: z.string(), updatedAt: z.string(),
});

export const publishedSystem = z.object({
  id: z.string(), title: z.string(), system,
});

export const publishCompendiumRequest = z.object({
  title: z.string().min(1).max(120),
  systemId: z.string().min(1),
  compendium,
});

export const compendiumSummary = z.object({
  id: z.string(), title: z.string(), systemId: z.string(),
  systemName: z.string(), authorName: z.string(),
  itemCount: z.number().int().nonnegative(), updatedAt: z.string(),
});

export const publishedCompendium = z.object({
  id: z.string(), title: z.string(), systemId: z.string(), compendium,
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

export const actIntent = z.object({
  roomId: z.string(),
  actionId: z.string().min(1),
  fromId: z.string().min(1),
  toId: z.string().min(1),
});

export const roomDelta = z.object({
  roomId: z.string(),
  sheets: z.array(sheet),
  log: z.array(z.object({
    id: z.string(),
    at: z.string(),
    text: z.string(),
  })),
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
  z.object({ type: z.literal('sheet:set'), roomId: z.string(), sheetId: z.string(), tag: z.string(), value: z.union([z.number(), z.string(), z.boolean(), z.null()]) }),

  z.object({ type: z.literal('sheet:create'), roomId: z.string(), name: z.string().min(1).max(64), kind: z.enum(['pc', 'npc']).optional() }),

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
export type PublishedCompendium = z.infer<typeof publishedCompendium>;
export type PublishRequest = z.infer<typeof publishRequest>;
export type WorldSummary = z.infer<typeof worldSummary>;
export type CreateRoomRequest = z.infer<typeof createRoomRequest>;
export type RoomSummary = z.infer<typeof roomSummary>;
export type RoomState = z.infer<typeof roomState>;
export type ActIntent = z.infer<typeof actIntent>;
export type RoomDelta = z.infer<typeof roomDelta>;
export type ServerMessage = z.infer<typeof serverMessage>;
export type ClientMessage = z.infer<typeof clientMessage>;
