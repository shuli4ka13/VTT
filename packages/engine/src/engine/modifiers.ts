import { compile } from '../formula/index.ts';
import { assertTarget, incomingTagOf, ANY_ROLL } from './targets.ts';
import { roomEffects, wornEffects, activationOf } from './effects.ts';
import { EngineError } from './errors.ts';
import { rowOf } from './tables.ts';
import type { System, Sheet, Compendium, Modifier, RollEdit } from '../model/types.ts';
import type { Pass } from './calc.ts';

export interface ModifierSource {
  type: 'room' | 'item' | 'kind' | 'effect' | 'claim';
  id: string;
  label?: string;
  modifiers: Modifier[];
}

export type SourcedModifier = Modifier & { source: ModifierSource };

export interface CollectedModifiers {
  value: Map<string, SourcedModifier[]>;
  roll: Map<string, SourcedModifier[]>;
}

export interface RollResolution {
  tag: string;

  edits: RollEdit[];
  bonus: number;
  sources: unknown[];
}

const STACKING: Record<string, (values: unknown[]) => unknown> = {
  sum: values => values.reduce((a, b) => (a as number) + (b as number), 0),
  max: values => values.reduce((a, b) => ((b as number) > (a as number) ? b : a)),
  override: values => values[values.length - 1],
};

export function collectModifiers(
  system: System, sheet: Sheet, compendium: Compendium,
): CollectedModifiers {
  const buckets: CollectedModifiers = { value: new Map(), roll: new Map() };
  if (!compendium) return buckets;

  for (const source of sourcesOf(system, sheet, compendium)) {
    for (const mod of source.modifiers) {

      assertTarget(system, mod.target, source.label);
      const bucket = mod.kind === 'roll' ? buckets.roll : buckets.value;
      let list = bucket.get(mod.target);
      if (!list) { list = []; bucket.set(mod.target, list); }
      list.push({ ...mod, source });
    }
  }
  return buckets;
}

function sourcesOf(system: System, sheet: Sheet, compendium: Compendium): ModifierSource[] {
  const sources: ModifierSource[] = [];

  for (const { id, effect } of roomEffects(system)) {
    if (activationOf(effect) !== 'passive') continue;
    sources.push({ type: 'room', id, label: effect.label || id, modifiers: effect.modifiers || [] });
  }

  for (const id of sheet.equipped || []) {
    const item = (compendium.items || []).find(i => i.id === id);
    if (!item) throw new EngineError(`лист «${sheet.id}» носит предмет «${id}», которого нет в компендиуме`);

    const kind = item.rk ? (system.records || {})[item.rk] : undefined;
    if (kind?.modifiers?.length) {
      sources.push({
        type: 'kind', id: String(item.rk), label: kind.label || String(item.rk),
        modifiers: kind.modifiers,
      });
    }
    sources.push({ type: 'item', id: item.id, label: item.label, modifiers: item.modifiers || [] });
  }

  for (const { id, effect } of wornEffects(system, sheet, { compendium })) {
    if (activationOf(effect) !== 'passive') continue;
    sources.push({ type: 'effect', id, label: effect.label || id, modifiers: effect.modifiers || [] });
  }

  return sources;
}

export interface ModifierContext { tags?: string[] }

export function applyValueModifiers(
  base: unknown, tag: string, pass: Pass, context: ModifierContext = {},
): unknown {
  if (!pass.modifiers) return base;
  const mods = pass.modifiers.value.get(tag);
  if (!mods || mods.length === 0) return base;

  const active = mods.filter(m => conditionHolds(m, pass) && tagsMatch(m, context.tags ?? [], pass.system));
  if (active.length === 0) return base;

  let value = base;

  const sets = active.filter(m => m.op === 'set');
  if (sets.length) {
    const rule = String(sets[sets.length - 1]!.stacking || 'override');
    value = reduce(rule, sets.map(m => valueOf(m, pass)), tag);
  }

  const adds = active.filter(m => m.op === 'add');
  if (adds.length) value = (value as number) + totalOf(adds, pass, tag);

  const muls = active.filter(m => m.op === 'mul');
  if (muls.length) value = (value as number) * totalOf(muls, pass, tag, 1);

  const floors = active.filter(m => m.op === 'floor').map(m => Number(valueOf(m, pass)));
  if (floors.length) value = Math.max(value as number, ...floors);

  const caps = active.filter(m => m.op === 'cap').map(m => Number(valueOf(m, pass)));
  if (caps.length) value = Math.min(value as number, ...caps);

  const unknown = active.find(m => !VALUE_OPS.includes(String(m.op)));
  if (unknown) throw new EngineError(`неизвестная операция модификатора «${unknown.op}» на мишени «${tag}»`);

  return value;
}

export const VALUE_OPS = ['set', 'add', 'mul', 'floor', 'cap'];

export function resolveRoll(
  system: System, _sheet: Sheet, rollTag: string | (string | null)[] | null, pass: Pass,
  extra: SourcedModifier[] = [],
): RollResolution {
  const tags = [...new Set((Array.isArray(rollTag) ? rollTag : [rollTag]).filter((t): t is string => Boolean(t)))];
  for (const tag of tags) assertTarget(system, tag);

  const bucket = (tag: string) => (pass?.modifiers ? pass.modifiers.roll.get(tag) || [] : []);
  const mods = [
    ...[...tags.flatMap(bucket), ...bucket(ANY_ROLL)].filter(m => conditionHolds(m, pass)),
    ...extra,
  ];

  const named = [...new Set(mods.map(m => m.edit).filter(Boolean))] as string[];
  const dictionary = system.roll_edits || {};
  for (const key of named) {
    if (!dictionary[key]) {
      throw new EngineError(
        `модификатор ссылается на правку броска «${key}», которой нет в словаре системы`);
    }
  }

  const surviving = named.filter(key => {
    const canceledBy = dictionary[key]!.canceledBy;
    return !canceledBy || !named.includes(canceledBy);
  });

  const adds = mods.filter(m => m.op === 'add');
  const bonus = adds.length ? totalOf(adds, pass, tags[0] ?? ANY_ROLL) : 0;

  return {
    tag: tags[0] ?? ANY_ROLL,
    edits: surviving.map(key => ({ ...dictionary[key]!, label: dictionary[key]!.label || key })),
    bonus,
    sources: mods.map(m => ({ ...m.source, edit: m.edit })),
  };
}

export function incomingRollModifiers(rollTag: string | null, pass: Pass): SourcedModifier[] {
  if (!pass.modifiers) return [];
  const bucket = (tag: string) => pass.modifiers!.roll.get(tag) || [];
  return [...(rollTag ? bucket(incomingTagOf(rollTag)) : []), ...bucket(incomingTagOf(ANY_ROLL))]
    .filter(m => conditionHolds(m, pass));
}

export function claimedModifiers(system: System, keys: string[], rollTag: string | null): SourcedModifier[] {
  const dictionary = system.roll_edits || {};
  return keys.map(key => {
    const edit = dictionary[key];
    if (!edit) {
      throw new EngineError(
        `заявлена правка броска «${key}», которой нет в словаре системы; есть: ${
          Object.keys(dictionary).join(', ') || '(пусто)'}`);
    }
    return {
      kind: 'roll' as const, target: rollTag ?? ANY_ROLL, edit: key, condition: null,
      source: { type: 'claim' as const, id: key, label: edit.label || key, modifiers: [] },
    };
  });
}

function tagsMatch(mod: SourcedModifier, tags: string[], system: System): boolean {
  const want = (mod as { tags?: string[] }).tags;
  const avoid = (mod as { notTags?: string[] }).notTags;
  const where = (mod as { where?: { table: string; column: string; is: unknown } }).where;
  if (want?.length && !want.some(t => tags.includes(t))) return false;
  if (avoid?.length && avoid.some(t => tags.includes(t))) return false;
  if (where && !tags.some(t => rowSays(system, where.table, t, where.column, where.is))) return false;
  return true;
}

function rowSays(system: System, table: string, key: string, column: string, is: unknown): boolean {
  const row = rowOf(system, table, key);
  if (!row) return false;
  const cell = (row.cells ?? {})[column];
  return cell === is || (cell !== undefined && cell !== null && String(cell) === String(is));
}

function conditionHolds(mod: SourcedModifier, pass: Pass): boolean {
  if (!mod.condition) return true;
  const result = compile(mod.condition).evaluate(pass.resolve);
  if (typeof result !== 'boolean') {
    throw new EngineError(
      `условие «${mod.condition}» источника «${mod.source.label}» должно давать логическое значение`);
  }
  return result;
}

function valueOf(mod: SourcedModifier, pass: Pass): unknown {
  const raw = (mod as { value?: unknown }).value;
  if (raw && typeof raw === 'object' && 'expr' in raw) {
    return compile((raw as { expr: string }).expr).evaluate(pass.resolve);
  }
  return raw;
}

function totalOf(mods: SourcedModifier[], pass: Pass, tag: string, seed = 0): number {
  const byRule = new Map<string, unknown[]>();
  for (const mod of mods) {
    const rule = String(mod.stacking || 'sum');
    let list = byRule.get(rule);
    if (!list) { list = []; byRule.set(rule, list); }
    list.push(valueOf(mod, pass));
  }
  const multiplying = seed !== 0;
  let total = seed;
  for (const [rule, values] of byRule) {
    const part = multiplying && rule === 'sum'
      ? (values as number[]).reduce((a, b) => a * b, 1)
      : reduce(rule, values, tag) as number;
    total = multiplying ? total * part : total + part;
  }
  return total;
}

function reduce(rule: string, values: unknown[], tag: string): unknown {
  const fn = STACKING[rule];
  if (!fn) {
    throw new EngineError(
      `неизвестное правило стакинга «${rule}» на мишени «${tag}»; доступны: ${Object.keys(STACKING).join(', ')}`);
  }
  return fn(values);
}
