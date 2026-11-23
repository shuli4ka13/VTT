import type { System } from '@vtt/schema';
import { fieldOf, kindOf } from '@vtt/engine';
import type { Field, Part } from '@vtt/engine';

export type Standing = 'new' | 'same' | 'own';

const canon = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, inner]) => inner !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, inner]) => [key, canon(inner)]));
  }
  return value;
};

export const sameContent = (a: unknown, b: unknown): boolean => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

const fieldSign = (system: System, field: Field): unknown => {
  const column = field.cell ? field.cell.column : field.tag;
  return {
    tag: field.tag,
    home: field.home,
    cell: field.cell,
    column: system.tables?.[field.home]?.columns?.find(one => one.key === column),
  };
}

export function fieldStanding(system: System, donor: System, field: Field): Standing {
  const mine = fieldOf(system, field.tag);
  if (!mine) return 'new';
  return sameContent(fieldSign(system, mine), fieldSign(donor, field)) ? 'same' : 'own';
}

export function fieldsStanding(system: System, donor: System, fields: readonly Field[]): Standing {
  const each = fields.map(field => fieldStanding(system, donor, field));
  if (each.includes('own')) return 'own';
  return each.length && each.every(one => one === 'same') ? 'same' : 'new';
}

export function partOf(system: System, part: Part): unknown {
  switch (part.kind) {
    case 'field': { const field = fieldOf(system, part.key); return field ? fieldSign(system, field) : undefined; }
    case 'effect': return system.effects?.[part.key];
    case 'table': return system.tables?.[part.key];
    case 'constant': return system.constants?.[part.key];
    case 'rollEdit': return system.roll_edits?.[part.key];
    case 'recordKind': return kindOf(system, part.key);
    case 'record': return system.library?.find(one => one.id === part.key);
    case 'roll': return system.rolls?.[part.key];
    case 'group': return system.groups?.[part.key];
    case 'block': return system.blocks?.find(one => one.key === part.key);
  }
}

export function partStanding(system: System, donor: System, part: Part): Standing {
  const mine = partOf(system, part);
  if (mine === undefined) return 'new';
  return sameContent(mine, partOf(donor, part)) ? 'same' : 'own';
}

export function effectStanding(system: System, donor: System, id: string): Standing {
  return partStanding(system, donor, { kind: 'effect', key: id });
}

export function piecesStanding(system: System, donor: System, added: readonly Part[], kept: readonly Part[]): { standing: Standing; own?: Part } {
  if (added.length) return { standing: 'new' };
  const own = kept.find(part => partStanding(system, donor, part) === 'own');
  return own ? { standing: 'own', own } : { standing: 'same' };
}

export const ownWords = (name: string): string => `в системе уже есть своё «${name}» — готовое не заменит его`;

export function defaultDonor(system: System, donors: readonly System[], originId?: string): string {
  const named = donors.find(donor => donor.id && (donor.id === system.id || donor.id === originId));
  if (named?.id) return named.id;
  const mine = new Set(Object.keys(system.tables ?? {}));
  let best: System | undefined;
  let most = -1;
  for (const donor of donors) {
    const shared = Object.keys(donor.tables ?? {}).filter(key => mine.has(key)).length;
    if (shared > most) { most = shared; best = donor; }
  }
  return best?.id ?? '*';
}
