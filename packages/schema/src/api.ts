import { z } from 'zod';
import { system, compendium, sheet, storedValue } from './world.ts';

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
  mine: z.boolean().optional(),
  behind: z.boolean().optional(),
});

export const publishedSystem = z.object({
  id: z.string(), title: z.string(), updatedAt: z.string(), system,
  behind: z.boolean().optional(),
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

export const member = z.object({
  userId: z.string(),
  name: z.string(),
  role: z.enum(['gm', 'player']).optional(),
  sheetId: z.string().nullable().optional(),
});

export const pendingState = z.object({
  id: z.string(),
  sheetId: z.string(),
  stage: z.enum(['target', 'after', 'done', 'seen', 'moment']),
  question: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string() })),
  preview: z.array(z.string()),
  hidden: z.boolean().optional(),
});

export const answerIntent = z.object({
  roomId: z.string(),
  pendingId: z.string().min(1),
  chosen: z.array(z.string().min(1)),
});

export const cancelIntent = z.object({
  roomId: z.string(),
  pendingId: z.string().min(1),
});

export const clockState = z.object({
  round: z.number().int().nonnegative(),
  order: z.array(z.string()),
  active: z.string().nullable(),
  sec: z.number().nonnegative().optional(),
  scores: z.record(z.string(), z.number()).optional(),
});

export const place = z.object({ x: z.number().int().min(0).max(199), y: z.number().int().min(0).max(199) }).strict();

export const places = z.record(z.string(), place);

export const logEntry = z.object({
  id: z.string(),
  at: z.string(),
  text: z.string(),
  lines: z.array(z.string()).optional(),
  hidden: z.boolean().optional(),
});

export const roomState = z.object({
  id: z.string(),
  title: z.string(),
  system,
  compendium,
  sheets: z.array(sheet),
  members: z.array(member),
  log: z.array(logEntry),

  clock: clockState.optional(),
  pending: pendingState.nullable().optional(),
  places: places.optional(),
});

const sheetList = z.array(z.string().min(1)).min(1).refine(list => new Set(list).size === list.length, 'лист указан дважды');

export const turnIntent = z.object({
  roomId: z.string(),
  op: z.enum(['start', 'next', 'stop', 'scene', 'short-rest', 'long-rest', 'time', 'join', 'leave']),
  order: z.array(z.string().min(1)).optional(),
  who: sheetList.optional(),
  seconds: z.number().positive().optional(),
}).refine(intent => !(intent.order?.length && intent.who), 'либо бросок инициативы, либо порядок руками — не оба')
  .refine(intent => (intent.op !== 'join' && intent.op !== 'leave') || Boolean(intent.who), 'кто вступает или выходит — не указано');

export const actIntent = z.object({
  roomId: z.string(),
  actionId: z.string().min(1),
  fromId: z.string().min(1),
  toIds: z.array(z.string().min(1)),

  claims: z.record(z.string().min(1), z.array(z.string().min(1))).optional(),

  inputs: z.record(z.string().min(1), z.union([z.number(), z.string(), z.record(z.string().min(1), z.union([z.number(), z.string()]))])).optional(),

  hidden: z.boolean().optional(),
});

export const journalEntry = z.object({
  seq: z.number().int().nonnegative(),
  at: z.string(),
  userId: z.string(),
  op: z.string().min(1),
  input: z.unknown(),
  dice: z.array(z.number().int()),
  result: z.lazy(() => roomDelta),
});

export const roomDelta = z.object({
  roomId: z.string(),
  sheets: z.array(sheet),
  log: z.array(logEntry),

  clock: clockState.optional(),
  pending: pendingState.nullable().optional(),
});

export const serverMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room:state'), state: roomState }),
  z.object({ type: z.literal('room:delta'), delta: roomDelta }),
  z.object({ type: z.literal('room:members'), members: z.array(member) }),
  z.object({ type: z.literal('room:places'), roomId: z.string(), places }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);

export const clientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room:join'), roomId: z.string(), token: z.string() }),
  z.object({ type: z.literal('room:act'), intent: actIntent }),
  z.object({ type: z.literal('room:turn'), intent: turnIntent }),
  z.object({ type: z.literal('room:answer'), intent: answerIntent }),
  z.object({ type: z.literal('room:cancel'), intent: cancelIntent }),
  z.object({ type: z.literal('sheet:set'), roomId: z.string(), sheetId: z.string(), tag: z.string(), value: storedValue }),

  z.object({ type: z.literal('sheet:create'), roomId: z.string(), name: z.string().min(1).max(64), of: z.string().min(1).optional() }),

  z.object({ type: z.literal('sheet:roll'), roomId: z.string(), sheetId: z.string(), tag: z.string().min(1), hidden: z.boolean().optional(), claims: z.array(z.string().min(1)).optional() }),

  z.object({ type: z.literal('sheet:claim'), roomId: z.string(), sheetId: z.string().nullable() }),

  z.object({ type: z.literal('piece:place'), roomId: z.string(), sheetId: z.string().min(1), at: place.nullable() }),

  z.object({
    type: z.literal('sheet:of'),
    roomId: z.string(),
    sheetId: z.string(),
    of: z.string().min(1).nullable(),
  }),

  z.object({
    type: z.literal('sheet:group'),
    roomId: z.string(),
    sheetId: z.string(),
    group: z.string().min(1).nullable(),
  }),

  z.object({
    type: z.literal('sheet:belong'),
    roomId: z.string(),
    sheetId: z.string(),
    list: z.enum(['has', 'effects']),
    id: z.string().min(1),
    on: z.boolean(),
    off: z.boolean().optional(),
    inst: z.string().min(1).optional(),
    add: z.boolean().optional(),
    in: z.string().min(1).nullable().optional(),
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
export type Member = z.infer<typeof member>;
export type ActIntent = z.infer<typeof actIntent>;
export type ClockState = z.infer<typeof clockState>;
export type PendingState = z.infer<typeof pendingState>;
export type AnswerIntent = z.infer<typeof answerIntent>;
export type CancelIntent = z.infer<typeof cancelIntent>;
export type TurnIntent = z.infer<typeof turnIntent>;
export type RoomDelta = z.infer<typeof roomDelta>;
export type LogEntry = z.infer<typeof logEntry>;
export type Place = z.infer<typeof place>;
export type Places = z.infer<typeof places>;
export type JournalEntry = z.infer<typeof journalEntry>;
export type ServerMessage = z.infer<typeof serverMessage>;
export type ClientMessage = z.infer<typeof clientMessage>;
