import { EngineError } from './errors.ts';
import { applyReading } from './readings.ts';
import { claimOf, applyClaimEdits, applyResultEdits, keptDice } from './roll-edits.ts';
import type { RolledDie, ReadSpec } from './readings.ts';
import type { KeepSpec } from './roll-edits.ts';
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

  grown: RolledDie[];
  keeps: KeepSpec[];
  reading: ReadSpec;
  plus: number;
  applied: RollEdit[];
}

export type SeenOp =
  | { kind: 'add'; count: number; sides?: number; keep?: 'best' | 'worst'; explode?: boolean }
  | { kind: 'reroll'; upTo: number }
  | { kind: 'plus'; value: number };

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

  const grown = applyResultEdits(entries, edits, die);
  return settle({
    edits: edits.map(e => e.label || '').filter(Boolean),
    versusShift: claim.versusShift,
    degreeShift: claim.degreeShift,
    read: claim.read.kind,
    entries, grown, keeps: claim.keeps, reading: claim.read, plus: 0, applied: edits,
  });
}

type Settled = Omit<LeadRoll, 'rolls' | 'raw' | 'kept' | 'total' | 'parts' | 'tally'>;

function settle(base: Settled): LeadRoll {
  const taken = keptDice(base.grown, base.keeps);
  const { total, kept } = applyReading(taken, base.reading);
  const parts: Record<string, number> = {};
  for (const entry of taken) {
    if (entry.name) parts[entry.name] = (parts[entry.name] ?? 0) + entry.value;
  }
  return {
    ...base,
    rolls: base.grown.map(e => e.value),
    raw: base.entries.map(e => e.value),
    kept, total: total + base.plus, parts,
    tally: tallyOf(base.entries),
  };
}

export function seeRoll(rolled: LeadRoll, op: SeenOp, die: Die): LeadRoll {
  const { rolls: _rolls, raw: _raw, kept: _kept, total: _total, parts: _parts, tally: _tally, ...base } = rolled;
  if (op.kind === 'plus') return settle({ ...base, plus: base.plus + op.value });
  if (op.kind === 'reroll') {
    const again = (entry: RolledDie): RolledDie =>
      (!entry.bonus && entry.value > 0 && entry.value <= op.upTo ? { ...entry, value: die(entry.sides) } : entry);
    const grown = base.grown.map(again);
    return settle({ ...base, grown, entries: base.entries.length === grown.length ? grown : base.entries });
  }
  const sides = op.sides ?? base.entries.find(entry => !entry.bonus)?.sides ?? 6;
  const fresh: RolledDie[] = Array.from({ length: Math.max(0, op.count) }, () => ({ value: die(sides), sides }));
  const grownFresh = applyResultEdits(fresh, base.applied, die);
  const all = [...base.grown, ...grownFresh];
  const grown = op.explode ? applyResultEdits(all, [{ label: '', ops: [{ op: 'explode', apart: true }] }], die) : all;
  const keeps = op.keep ? [...base.keeps, { n: 1, from: op.keep } as KeepSpec] : base.keeps;
  return settle({ ...base, entries: [...base.entries, ...fresh], grown, keeps });
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
