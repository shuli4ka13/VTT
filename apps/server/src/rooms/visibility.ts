import type { RoomDelta, RoomState, Sheet, System } from '@vtt/schema';
import { sheetsFor, mainLang } from '@vtt/engine';
import { sayIn } from '../common/words.ts';
import type { Viewer } from '@vtt/engine';

export const hiddenWords = (system: System): string => sayIn(mainLang(system))`Ведущий бросает втайне`;

export interface Sight extends Viewer {
  system: System;
  sheets: readonly Sheet[];
}

type Viewable = Pick<RoomState, 'log'> & { pending?: RoomState['pending']; sheets?: Sheet[] };

export function seenBy<T extends Viewable | RoomDelta>(payload: T, sight: Sight): T {
  if (sight.gm) return payload;
  const log = payload.log.map(entry => (entry.hidden ? { id: entry.id, at: entry.at, text: hiddenWords(sight.system), hidden: true } : entry));
  const pending = payload.pending && payload.pending.hidden ? { ...payload.pending, preview: [] } : payload.pending;
  const sheets = payload.sheets ? sheetsFor(sight.system, payload.sheets, sight, sight.sheets) : undefined;
  return { ...payload, log, ...(pending !== undefined ? { pending } : {}), ...(sheets ? { sheets } : {}) };
}
