import { NAMES } from '../words/names.ts';
import { compile } from '../formula/index.ts';
import { assertTarget } from './targets.ts';
import { ROLL_CALL, CALL_WORDS } from '../words/calls.ts';
import { amountParamOf } from '../model/lists.ts';
import { wornEffects, activationOf } from './effects.ts';
import { EngineError } from './errors.ts';
import { stackStages, targetStages, VALUE_OPS } from './stages.ts';
import { anyRowSays } from './tables.ts';
import { findRecord, kindOfRecord, sheetKindOf, propsOf, working, keyOf } from '../model/owned.ts';
import { tagsFit } from './roll-tags.ts';
import type { System, Sheet, Compendium, Modifier, RollEdit, RollEditOp, Param, CellMark, TableRow, WornEffect } from '../model/types.ts';
import { leftOf, LEFT_NAME } from '../events/durations.ts';
import type { Pass } from './calc.ts';
import { withRecord, hasTargetSlot, itemTarget, hasInputSlot, inputTarget, withRow, rowKeyOf } from '../model/sheet-columns.ts';
import { cellTagOf, columnTagOf } from './cells.ts';
import { toolsOf } from './refs.ts';
import { rollHeld, rollEdits, wordApplies } from '../core/edits.ts';
import { PLUS_OP } from '../core/dice.ts';
import { average } from '../core/external.ts';

export interface ModifierSource {
  type: 'item' | 'kind' | 'effect' | 'claim';
  id: string;
  label?: string;
  modifiers: Modifier[];
  params?: Param[];
  args?: Record<string, unknown>;
  worn?: WornEffect;
}

export type SourcedModifier = Modifier & { source: ModifierSource };

export interface CollectedModifiers {
  value: Map<string, SourcedModifier[]>;
  edits: Map<string, SourcedModifier[]>;
}

type EditModifier = Extract<Modifier, { kind: 'edit' }>;

export const editKey = (call: string, param: string): string => `${call}.${param}`;

const assertCall = (system: System, mod: EditModifier, owner?: string): void => {
  if (mod.call === ROLL_CALL) {
    if (mod.param in CALL_WORDS.roll.params) return;
    throw new EngineError(`${owner ? `«${owner}»: ` : ''}у броска нет параметра «${mod.param}» — есть ${Object.keys(CALL_WORDS.roll.params).map(one => `«${one}»`).join(', ')}`);
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
        put(buckets.edits, editKey(mod.call, mod.param), { ...mod, source });
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
    if (!working(sheet, entry)) continue;
    const item = findRecord(compendium, entry.of);
    if (!item) throw new EngineError(`у листа «${sheet.id}» есть «${entry.of}», которого нет в компендиуме`);

    const kind = kindOfRecord(system, item);
    const cells = propsOf(item, system, entry) ?? {};
    const aimed = (list: Modifier[]): Modifier[] => list.flatMap(mod => {
      if (mod.kind !== 'value' || !hasTargetSlot(mod.target)) return [mod];
      const target = itemTarget(mod.target, cells);
      return target ? [{ ...mod, target }] : [];
    });
    const mine = (list: Modifier[]): Modifier[] => (item.table ? withRecord(system, item.table, cells, aimed(list), keyOf(entry)) : aimed(list));
    if (kind?.modifiers?.length) {
      sources.push({
        type: 'kind', id: String(item.table), label: kind.label || String(item.table),
        modifiers: mine(kind.modifiers),
      });
    }
    if (item.modifiers?.length) sources.push({ type: 'item', id: item.id, label: item.label, modifiers: mine(item.modifiers) });
  }

  for (const { id, effect, entry } of wornEffects(system, sheet, { compendium })) {
    if (activationOf(effect) !== 'passive') continue;
    const args = (entry.args ?? {}) as Record<string, unknown>;
    const modifiers = (effect.modifiers || []).flatMap(mod => {
      if (mod.kind !== 'value' || !hasInputSlot(mod.target)) return [mod];
      const target = inputTarget(system, mod.target, effect.params ?? [], args);
      return target ? [{ ...mod, target }] : [];
    });
    sources.push({
      type: 'effect', id, label: effect.label || id, modifiers,
      ...(effect.params?.length ? { params: effect.params, args: (entry.args ?? {}) as Record<string, unknown> } : {}),
      worn: entry,
    });
  }

  return sources;
}


export function applyValueModifiers(
  base: unknown, tag: string, pass: Pass, also: readonly string[] = [], cell?: CellMark,
): unknown {
  const staged = targetStages(pass.system, tag).length > 0;
  if (!pass.modifiers) return staged ? stackNumber([], base, tag, pass) : base;
  const row = cell ? (pass.system.tables?.[cell.table]?.rows ?? []).find(one => rowKeyOf(one) === cell.row) : undefined;
  const near = cell && row ? [cellTagOf(cell.table, String(row.value), cell.column), columnTagOf(cell.table, cell.column)] : [];
  const mods = [tag, ...also, ...near].flatMap(one => pass.modifiers!.value.get(one) ?? [])
    .map(mod => (cell && row ? onRow(mod, cell.table, row, pass.system) : mod));
  const active = mods.filter(m => conditionHolds(m, pass));
  if (active.length === 0 && !staged) return base;

  return stackNumber(active, base, tag, pass);
}

function onRow(mod: SourcedModifier, table: string, row: TableRow, system: System): SourcedModifier {
  const value = (mod as { value?: { expr?: string } }).value?.expr;
  const condition = (mod as { if?: { expr?: string } }).if?.expr;
  const rowed = (expr: string | undefined): boolean => typeof expr === 'string' && expr.includes(`@${NAMES.row}`);
  if (!rowed(value) && !rowed(condition)) return mod;
  return {
    ...mod,
    ...(rowed(value) ? { value: { expr: withRow(system, table, row, value!) } } : {}),
    ...(rowed(condition) ? { if: { expr: withRow(system, table, row, condition!) } } : {}),
  } as SourcedModifier;
}

function stackNumber(active: SourcedModifier[], base: unknown, tag: string, pass: Pass): unknown {
  return stackStages(active, base, tag, mod => valueOf(mod, pass), targetStages(pass.system, tag));
}

export { VALUE_OPS };

export const editsOf = (pass: Pass, call: string, param: string): SourcedModifier[] =>
  (pass?.modifiers ? pass.modifiers.edits.get(editKey(call, param)) || [] : []);

export function resolveRoll(
  _system: System, _sheet: Sheet, rollTags: readonly (string | null | undefined)[], pass: Pass,
): RollResolution {
  const tags = [...new Set(rollTags.filter((t): t is string => Boolean(t)))];
  const held = rollHeld([{ id: pass.sheet.id, view: pass }], pass.sheet.id, null, tags);
  const { edits, addends } = rollEdits(held, [], pass, tags);
  const bonus = addends.reduce((sum, one) => sum + one.value(average), 0);
  return { tags, edits, bonus, sources: held.filter(m => !m.edit || wordApplies(pass.system, m.edit, tags)).map(m => ({ ...m.source, edit: m.edit })) };
}

const isFormula = (value: unknown): value is { expr: string } =>
  Boolean(value && typeof value === 'object' && 'expr' in (value as object));

export function withValues(edit: RollEdit & { label: string }, pass: Pass): RollEdit & { label: string } {
  const counted = (op: RollEditOp): boolean => op.op !== PLUS_OP;
  if (!(edit.ops ?? []).some(op => counted(op) && Object.values(op).some(isFormula))) return edit;
  const ops = edit.ops.map(op => (!counted(op) ? op : Object.fromEntries(Object.entries(op).map(([key, value]) => {
    if (!isFormula(value)) return [key, value];
    const number = Number(compile(value.expr).evaluate(pass.resolve, toolsOf(pass.system, pass, 'правка броска')));
    if (!Number.isFinite(number)) throw new EngineError(`правка броска «${edit.label}»: «${key}» — формула «${value.expr}» дала не число`);
    return [key, number];
  })) as typeof op));
  return { ...edit, ops };
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


export function editMatches(mod: SourcedModifier, tags: readonly string[], system: System): boolean {
  const where = (mod as { where?: { table: string; column: string; is: unknown } }).where;
  if (!tagsFit(mod as { tags?: string[]; anyTags?: string[]; notTags?: string[] }, tags)) return false;
  if (where && !anyRowSays(system, [...tags], where)) return false;
  return true;
}


function resolverOf(mod: SourcedModifier, pass: Pass): (name: string) => unknown {
  const params = mod.source.params;
  const worn = mod.source.worn;
  const left = (name: string): unknown => (worn && name === LEFT_NAME ? leftOf(worn, typeof pass.round?.() === 'number' ? { round: pass.round!()! } : null) : undefined);
  if (!params?.length) return worn ? name => left(name) ?? pass.resolve(name) : pass.resolve;
  const args = mod.source.args ?? {};
  return name => {
    const remaining = left(name);
    if (remaining !== undefined && remaining !== null) return remaining;
    const param = params.find(one => one.key === name);
    if (!param) return pass.resolve(name);
    const given = args[name];
    if (given !== undefined && given !== null && given !== '') return given;
    return param.default ?? null;
  };
}

function conditionHolds(mod: SourcedModifier, pass: Pass): boolean {
  const condition = (mod as { if?: { expr: string } }).if;
  if (!condition) return true;
  const result = compile(condition.expr).evaluate(resolverOf(mod, pass), toolsOf(pass.system, pass, 'условие модификатора'));
  if (typeof result !== 'boolean') {
    throw new EngineError(
      `условие «${condition.expr}» источника «${mod.source.label}» должно давать да или нет`);
  }
  return result;
}

function valueOf(mod: SourcedModifier, pass: Pass): unknown {
  const raw = (mod as { value?: { expr: string } }).value;
  if (!raw?.expr?.trim()) throw new EngineError(`правка «${mod.source.label}»: не задано, на сколько`);
  return compile(raw.expr).evaluate(resolverOf(mod, pass), toolsOf(pass.system, pass, 'модификатор'));
}

