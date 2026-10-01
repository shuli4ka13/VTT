import type { RoomDelta, RoomState } from '@vtt/schema';

export const HIDDEN_WORDS = 'Ведущий бросает втайне';

type Viewable = Pick<RoomState, 'log'> & { pending?: RoomState['pending'] };

export function seenBy<T extends Viewable | RoomDelta>(payload: T, gm: boolean): T {
  if (gm) return payload;
  const log = payload.log.map(entry => (entry.hidden ? { id: entry.id, at: entry.at, text: HIDDEN_WORDS, hidden: true } : entry));
  const pending = payload.pending && payload.pending.hidden ? { ...payload.pending, preview: [] } : payload.pending;
  return { ...payload, log, ...(pending !== undefined ? { pending } : {}) };
}
