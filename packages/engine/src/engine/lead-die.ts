import { EngineError } from './errors.ts';
import { applyReading } from './readings.ts';
import { claimOf, applyClaimEdits, applyResultEdits, keptDice } from './roll-edits.ts';
import type { RolledDie } from './readings.ts';
import type { System, DieConstant, Die, RollEdit } from '../model/types.ts';

export interface LeadRoll {
  rolls: number[];
  kept: number | null;
  total: number;
  parts: Record<string, number>;

  edits: string[];

  versusShift: number;

  degreeShift: number;

  read: string;

  tally: { dice: number; atMax: number; atMin: number };
}

export function dieConstant(system: System, name: string): DieConstant {
  const constants = system.constants;
  if (!constants || !Object.keys(constants).length) {
    throw new EngineError(
      `система «${system.id || '?'}» не объявляет констант — ведущую кость взять неоткуда`);
  }
  const def = constants[name];
  if (!def) {
    throw new EngineError(
      `система не объявляет константы «${name}» — есть: ${Object.keys(constants).join(', ')}`);
  }
  if (def.kind !== 'die') {
    throw new EngineError(`константа «${name}» — не кость (${def.kind}); ею не бросают`);
  }
  return def as DieConstant;
}

export type CountResolver = (ref: unknown, what: string) => number;

export function unfoldDice(def: DieConstant, resolveCount?: CountResolver): DieConstant {
  const dice = (def.dice || []).map(spec => {
    const raw = spec.count ?? 1;
    if (typeof raw === 'number') return spec;
    if (!resolveCount) {
      throw new EngineError(
        `счёт костей «${def.label || '?'}» — ссылка, а разрешить её здесь нечем`);
    }
    const count = resolveCount(raw, `счёт костей «${spec.label || def.label || '?'}»`);
    if (!Number.isInteger(count) || count < 0) {
      throw new EngineError(
        `счёт костей «${def.label || '?'}» должен быть целым не меньше нуля, а вышло ${count}`);
    }
    return { ...spec, count };
  });
  return { ...def, dice };
}

export function rollLead(def: DieConstant, die: Die, edits: RollEdit[] = []): LeadRoll {
  const claim = applyClaimEdits(claimOf(def), edits);

  const entries: RolledDie[] = [];
  for (const term of claim.dice) {
    const count = term.count ?? 1;
    if (typeof count !== 'number') {
      throw new EngineError(
        `счёт костей «${def.label || '?'}» — неразрешённая ссылка; сперва unfoldDice`);
    }
    for (let i = 0; i < count; i++) {
      entries.push({
        value: die(term.sides), sides: term.sides,
        ...(term.name ? { name: String(term.name) } : {}),
      });
    }
  }

  const tally = tallyOf(entries);

  const grown = applyResultEdits(entries, edits, die);
  const taken = keptDice(grown, claim.keeps);
  const { total, kept } = applyReading(taken, claim.read);

  const parts: Record<string, number> = {};
  for (const entry of taken) {
    if (entry.name) parts[entry.name] = (parts[entry.name] ?? 0) + entry.value;
  }

  return {
    rolls: grown.map(e => e.value),
    kept, total, parts,
    edits: edits.map(e => e.label || '').filter(Boolean),
    versusShift: claim.versusShift,
    degreeShift: claim.degreeShift,
    read: claim.read.kind,
    tally,
  };
}

function tallyOf(entries: RolledDie[]) {
  return {
    dice: entries.length,
    atMax: entries.filter(e => e.value === e.sides).length,
    atMin: entries.filter(e => e.value === 1).length,
  };
}
