import { isDesk } from '../engine/owners.ts';
import { fieldOf } from './sheet-columns.ts';
import type { Field, Sheet, System } from './types.ts';
import { live } from '../words/tongue.ts';

export interface Viewer {
  gm: boolean;
  sheetId: string | null;
}

export type Circle = 'all' | 'owner' | 'gm';

export const CIRCLE_WORDS: Record<Circle, string> = live({ all: 'все', owner: 'тот, кто играет листом, и ведущий', gm: 'только ведущий' });

export const circleOf = (field: Pick<Field, 'sees'> | null | undefined): Circle =>
  (field?.sees === 'gm' ? 'gm' : field?.sees === 'owner' ? 'owner' : 'all');

const RANK: Record<Circle, number> = { gm: 1, owner: 2, all: 3 };

export const narrower = (a: Circle, b: Circle): boolean => RANK[a] < RANK[b];

export const isSecret = (field: Pick<Field, 'sees'> | null | undefined): boolean => circleOf(field) !== 'all';

export const isService = (field: Pick<Field, 'sees'> | null | undefined): boolean => field?.sees === 'none';

export const handEdited = (field: Pick<Field, 'sees' | 'edits' | 'value'>): boolean =>
  field.value.kind === 'stored' && field.sees !== 'none' && field.edits !== 'none';

type Seen = Pick<Field, 'sees' | 'lives'> | null | undefined;

export function knows(sheets: readonly Sheet[], viewer: Viewer, holder: Pick<Sheet, 'id'>, field: Seen): boolean {
  const circle = circleOf(field);
  if (viewer.gm || circle === 'all') return true;
  if (circle !== 'owner' || !viewer.sheetId || isDesk(holder)) return false;
  if (viewer.sheetId === holder.id) return true;
  return field?.lives === 'group' && sheets.find(sheet => sheet.id === viewer.sheetId)?.group === holder.id;
}

export const shows = (sheets: readonly Sheet[], viewer: Viewer, holder: Pick<Sheet, 'id'>, field: Seen): boolean =>
  !isService(field) && knows(sheets, viewer, holder, field);

export function sheetsFor(system: System, sheets: readonly Sheet[], viewer: Viewer, room: readonly Sheet[] = sheets): Sheet[] {
  if (viewer.gm) return [...sheets];
  return sheets.map(sheet => {
    const hidden = Object.keys(sheet.values ?? {}).filter(tag => !knows(room, viewer, sheet, fieldOf(system, tag)));
    if (!hidden.length) return sheet;
    const values = { ...sheet.values };
    for (const tag of hidden) delete values[tag];
    return { ...sheet, values };
  });
}
