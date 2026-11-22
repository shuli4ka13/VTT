import { sheetNamesAt, labelsAt, labelsOf, choiceTablesAt } from '@vtt/engine';
import type { NamePlace as Place } from '@vtt/engine';
import type { SheetNames } from '../../../ui/formula-chips.tsx';
import type { System } from '@vtt/schema';

export const placeNamesAt = labelsAt;

export const placeTablesAt = choiceTablesAt;

export { labelsOf };

export const sheetsAt = (system: System, id: string, place: Place): SheetNames =>
  new Map(sheetNamesAt(system, id, place).filter(one => !one.many).map(one => [one.name, one.label]));
