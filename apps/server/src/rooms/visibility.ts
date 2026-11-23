import type { RoomDelta, RoomState, Sheet, System } from '@vtt/schema';
import { sheetsFor } from '@vtt/engine';
import type { Viewer } from '@vtt/engine';

export const HIDDEN_WORDS = 'Ведущий бросает втайне';

export interface Sight extends Viewer {
  system: System;
  sheets: readonly Sheet[];
}

type Viewable = Pick<RoomState, 'log'> & { pending?: RoomState['pending']; sheets?: Sheet[] };

export function seenBy<T extends Viewable | RoomDelta>(payload: T, sight: Sight): T {
  if (sight.gm) return payload;
  const log = payload.log.map(entry => (entry.hidden ? { id: entry.id, at: entry.at, text: HIDDEN_WORDS, hidden: true } : entry));
  const pending = payload.pending && payload.pending.hidden ? { ...payload.pending, preview: [] } : payload.pending;
  const sheets = payload.sheets ? sheetsFor(sight.system, payload.sheets, sight, sight.sheets) : undefined;
  return { ...payload, log, ...(pending !== undefined ? { pending } : {}), ...(sheets ? { sheets } : {}) };
}
