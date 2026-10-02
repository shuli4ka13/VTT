import { sheetNamesAt } from '@vtt/engine/model/names-at';
import type { Place } from '@vtt/engine/model/names-at';
import type { SheetNames } from '../../../ui/formula-chips.tsx';
import type { System } from '@vtt/schema';

export const sheetsAt = (system: System, id: string, place: Place): SheetNames =>
  new Map(sheetNamesAt(system, id, place).map(one => [one.name, one.label]));
