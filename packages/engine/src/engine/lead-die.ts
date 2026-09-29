import { EngineError } from './errors.ts';
import { applyReading } from './readings.ts';
import { claimOf, applyClaimEdits, applyResultEdits, keptDice } from './roll-edits.ts';
import type { RolledDie } from './readings.ts';
import type { System, DieConstant, Die, RollEdit } from '../model/types.ts';

export interface LeadRoll {
  rolls: number[];

  raw: number[];
  kept: number | null;
  total: number;
  parts: Record<string, number>;

  edits: string[];

  versusShift: number;

  degreeShift: number;

  read: string;

  tally: { dice: number; atMax: number; atMin: number };

  entries: RolledDie[];
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

export function withCount(def: DieConstant, count: unknown, owner: string): DieConstant {
  if (count === undefined || count === null) return def;
  const dice = def.dice ?? [];
  if (dice.length !== 1) {
    throw new EngineError(`${owner}: число костей задаёт проверка, а кость «${def.label ?? '?'}» составная — возьмите кость из одного вида`);
  }
  return { ...def, dice: [{ ...dice[0]!, count: count as never }] };
}

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

export function rollLead(def: DieConstant, die: Die, edits: RollEdit[] = [], keep: RolledDie[] = []): LeadRoll {
  const claim = applyClaimEdits(claimOf(def), edits);

  const pool = [...keep];
  const entries: RolledDie[] = [];
  for (const term of claim.dice) {
    const count = term.count ?? 1;
    if (typeof count !== 'number') {
      throw new EngineError(
        `счёт костей «${def.label || '?'}» — неразрешённая ссылка; сперва unfoldDice`);
    }
    for (let i = 0; i < count; i++) {
      const same = pool.findIndex(e => e.sides === term.sides
        && (e.name ?? '') === String(term.name ?? '') && Boolean(e.bonus) === Boolean(term.bonus)
        && (e.value < 0) === Boolean(term.minus));
      const value = same >= 0 ? pool.splice(same, 1)[0]!.value : (term.minus ? -die(term.sides) : die(term.sides));
      entries.push({
        value, sides: term.sides,
        ...(term.name ? { name: String(term.name) } : {}),
        ...(term.bonus ? { bonus: true } : {}),
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
    raw: entries.map(e => e.value),
    kept, total, parts,
    edits: edits.map(e => e.label || '').filter(Boolean),
    versusShift: claim.versusShift,
    degreeShift: claim.degreeShift,
    read: claim.read.kind,
    tally,
    entries,
  };
}

function tallyOf(entries: RolledDie[]) {
  return {
    dice: entries.length,
    atMax: entries.filter(e => e.value === e.sides).length,
    atMin: entries.filter(e => e.value === 1).length,
  };
}

export function dieText(system: System, name: string): string {
  const die = dieConstant(system, name);
  const terms = die.dice ?? [];
  const first = terms[0];
  if (terms.length !== 1 || !first || typeof first.count === 'object') {
    throw new EngineError(
      `«${die.label || name}» — составная кость, её бросает проверка, а числом её не записать`);
  }
  return `${first.count ?? 1}d${first.sides}`;
}
