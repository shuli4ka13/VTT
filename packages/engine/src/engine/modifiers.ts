import { compile } from '../formula/index.ts';
import { assertTarget } from './targets.ts';
import { ROLL_CALL } from '../words/calls.ts';
import { amountParamOf } from '../model/lists.ts';
import { wornEffects, activationOf } from './effects.ts';
import { EngineError } from './errors.ts';
import { FormulaRuntimeError } from '../formula/errors.ts';
import { anyRowSays } from './tables.ts';
import { findRecord, kindOfRecord, sheetKindOf, propsOf } from '../model/owned.ts';
import { tagsHold } from './roll-tags.ts';
import type { System, Sheet, Compendium, Modifier, RollEdit } from '../model/types.ts';
import type { Pass } from './calc.ts';
import { withRecord } from '../model/sheet-columns.ts';
import { toolsOf } from './refs.ts';

export interface ModifierSource {
  type: 'item' | 'kind' | 'effect' | 'claim';
  id: string;
  label?: string;
  modifiers: Modifier[];
}

export type SourcedModifier = Modifier & { source: ModifierSource };

export interface CollectedModifiers {
  value: Map<string, SourcedModifier[]>;
  edits: Map<string, SourcedModifier[]>;
}

type EditModifier = Extract<Modifier, { kind: 'edit' }>;

export const editKey = (call: string, param: string, as?: string): string =>
  `${as ? `${as}:` : ''}${call}.${param}`;

const assertCall = (system: System, mod: EditModifier, owner?: string): void => {
  if (mod.call === ROLL_CALL) {
    if (mod.param === 'edits' || mod.param === 'bonus') return;
    throw new EngineError(`${owner ? `«${owner}»: ` : ''}у броска нет параметра «${mod.param}» — есть «edits» и «bonus»`);
  }
  const who = owner ? `«${owner}»: ` : '';
  const effect = system.effects?.[mod.call];
  if (!effect) throw new EngineError(`${who}правка вызова «${mod.call}» — такого эффекта в системе нет`);
  if (amountParamOf(effect)?.key !== mod.param) {
    throw new EngineError(`${who}правка «${effect.label || mod.call}» правит вход «${mod.param}», а величина эффекта — ${amountParamOf(effect)?.key ? `«${amountParamOf(effect)!.key}»` : 'не задана'}`);
  }
};

export interface RollResolution {
  tags: string[];

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
  const buckets: CollectedModifiers = { value: new Map(), edits: new Map() };
  if (!compendium) return buckets;
  const put = (bucket: Map<string, SourcedModifier[]>, key: string, mod: SourcedModifier) => {
    let list = bucket.get(key);
    if (!list) { list = []; bucket.set(key, list); }
    list.push(mod);
  };

  for (const source of sourcesOf(system, sheet, compendium)) {
    for (const mod of source.modifiers) {
      if (mod.kind === 'edit') {
        assertCall(system, mod, source.label);
        put(buckets.edits, editKey(mod.call, mod.param, mod.as), { ...mod, source });
        continue;
      }
      assertTarget(system, mod.target, source.label);
      put(buckets.value, mod.target, { ...mod, source });
    }
  }
  return buckets;
}

function sourcesOf(system: System, sheet: Sheet, compendium: Compendium): ModifierSource[] {
  const sources: ModifierSource[] = [];

  const own = sheetKindOf(system, sheet);
  if (own?.modifiers?.length) {
    sources.push({ type: 'kind', id: String(sheet.of), label: own.label || String(sheet.of), modifiers: own.modifiers });
  }

  for (const entry of sheet.has || []) {
    if (entry.off) continue;
    const item = findRecord(compendium, entry.of);
    if (!item) throw new EngineError(`у листа «${sheet.id}» есть «${entry.of}», которого нет в компендиуме`);

    const kind = kindOfRecord(system, item);
    const cells = propsOf(item, system, entry) ?? {};
    const mine = <T,>(list: T): T => (item.table ? withRecord(system, item.table, cells, list) : list);
    if (kind?.modifiers?.length) {
      sources.push({
        type: 'kind', id: String(item.table), label: kind.label || String(item.table),
        modifiers: mine(kind.modifiers),
      });
    }
    if (item.modifiers?.length) sources.push({ type: 'item', id: item.id, label: item.label, modifiers: mine(item.modifiers) });
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

  return stackNumber(active, base, tag, pass);
}

function stackNumber(active: SourcedModifier[], base: unknown, tag: string, pass: Pass): unknown {
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

const editsOf = (pass: Pass, call: string, param: string, as?: string): SourcedModifier[] =>
  (pass?.modifiers ? pass.modifiers.edits.get(editKey(call, param, as)) || [] : []);

export const CALL_NAME = 'вызов';

function callHolds(mod: SourcedModifier, pass: Pass, args: Record<string, unknown>): boolean {
  const when = (mod as { when?: { expr?: string } }).when;
  if (!when?.expr?.trim()) return true;
  const prefix = `${CALL_NAME}.`;
  let result: unknown;
  try {
    result = compile(when.expr).evaluate(
      name => (name.startsWith(prefix) ? (args[name.slice(prefix.length)] ?? null) as never : pass.resolve(name)),
      toolsOf(pass.system, pass, 'условие правки'));
  } catch (err) {
    if (err instanceof FormulaRuntimeError) return false;
    throw err;
  }
  if (typeof result !== 'boolean') {
    throw new EngineError(`условие правки «${when.expr}» источника «${mod.source.label}» должно давать да или нет`);
  }
  return result;
}

export function editNumber(
  pass: Pass, call: string, param: string, base: number, tags: readonly string[], args: Record<string, unknown> = {},
): number {
  const active = editsOf(pass, call, param)
    .filter(m => conditionHolds(m, pass) && editMatches(m, tags, pass.system) && callHolds(m, pass, args));
  return active.length ? Number(stackNumber(active, base, `${call}.${param}`, pass)) : base;
}

export function resolveRoll(
  system: System, _sheet: Sheet, rollTags: readonly (string | null | undefined)[], pass: Pass,
  extra: SourcedModifier[] = [],
): RollResolution {
  const tags = [...new Set(rollTags.filter((t): t is string => Boolean(t)))];
  const mods = [
    ...rollEditsOf(pass, tags),
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

  const numbers = mods.filter(m => m.op);
  const bonus = numbers.length ? Number(stackNumber(numbers, 0, tags.join(', ') || ROLL_CALL, pass)) : 0;

  return {
    tags,
    edits: surviving.map(key => withValues({ ...dictionary[key]!, label: dictionary[key]!.label || key }, pass)),
    bonus,
    sources: mods.map(m => ({ ...m.source, edit: m.edit })),
  };
}

const isFormula = (value: unknown): value is { expr: string } =>
  Boolean(value && typeof value === 'object' && 'expr' in (value as object));

function withValues(edit: RollEdit & { label: string }, pass: Pass): RollEdit & { label: string } {
  if (!(edit.ops ?? []).some(op => Object.values(op).some(isFormula))) return edit;
  const ops = edit.ops.map(op => Object.fromEntries(Object.entries(op).map(([key, value]) => {
    if (!isFormula(value)) return [key, value];
    const number = Number(compile(value.expr).evaluate(pass.resolve, toolsOf(pass.system, pass, 'правка броска')));
    if (!Number.isFinite(number)) throw new EngineError(`правка броска «${edit.label}»: «${key}» — формула «${value.expr}» дала не число`);
    return [key, number];
  })) as typeof op);
  return { ...edit, ops };
}

const rollEditsOf = (pass: Pass, tags: readonly string[], as?: string): SourcedModifier[] =>
  [...editsOf(pass, ROLL_CALL, 'edits', as), ...editsOf(pass, ROLL_CALL, 'bonus', as)]
    .filter(m => conditionHolds(m, pass) && editMatches(m, tags, pass.system) && callHolds(m, pass, { метки: [...tags] }));

export function incomingRollModifiers(rollTags: readonly string[], pass: Pass): SourcedModifier[] {
  return rollEditsOf(pass, rollTags, 'against');
}

export function claimedModifiers(system: System, keys: string[]): SourcedModifier[] {
  const dictionary = system.roll_edits || {};
  return keys.map(key => {
    const edit = dictionary[key];
    if (!edit) {
      throw new EngineError(
        `заявлена правка броска «${key}», которой нет в словаре системы; есть: ${
          Object.keys(dictionary).join(', ') || '(пусто)'}`);
    }
    return {
      kind: 'edit' as const, call: ROLL_CALL, param: 'edits', edit: key,
      source: { type: 'claim' as const, id: key, label: edit.label || key, modifiers: [] },
    };
  });
}

function editMatches(mod: SourcedModifier, tags: readonly string[], system: System): boolean {
  const all = (mod as { tags?: string[] }).tags;
  const any = (mod as { anyTags?: string[] }).anyTags;
  const avoid = (mod as { notTags?: string[] }).notTags;
  const where = (mod as { where?: { table: string; column: string; is: unknown } }).where;
  if (all?.length && !tagsHold(all, tags)) return false;
  if (any?.length && !any.some(t => tags.includes(t))) return false;
  if (avoid?.length && avoid.some(t => tags.includes(t))) return false;
  if (where && !anyRowSays(system, [...tags], where)) return false;
  return true;
}

function tagsMatch(mod: SourcedModifier, tags: string[], system: System): boolean {
  const want = (mod as { tags?: string[] }).tags;
  const avoid = (mod as { notTags?: string[] }).notTags;
  const where = (mod as { where?: { table: string; column: string; is: unknown } }).where;
  if (want?.length && !want.some(t => tags.includes(t))) return false;
  if (avoid?.length && avoid.some(t => tags.includes(t))) return false;
  if (where && !anyRowSays(system, tags, where)) return false;
  return true;
}


function conditionHolds(mod: SourcedModifier, pass: Pass): boolean {
  if (!mod.condition) return true;
  const result = compile(mod.condition.expr).evaluate(pass.resolve, toolsOf(pass.system, pass, 'условие модификатора'));
  if (typeof result !== 'boolean') {
    throw new EngineError(
      `условие «${mod.condition.expr}» источника «${mod.source.label}» должно давать да или нет`);
  }
  return result;
}

function valueOf(mod: SourcedModifier, pass: Pass): unknown {
  const raw = (mod as { value?: { expr: string } }).value;
  if (!raw?.expr?.trim()) throw new EngineError(`правка «${mod.source.label}»: не задано, на сколько`);
  return compile(raw.expr).evaluate(pass.resolve, toolsOf(pass.system, pass, 'модификатор'));
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
