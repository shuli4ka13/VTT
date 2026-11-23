import { compile } from '../formula/index.ts';
import { UnknownTagError, CycleError, EngineError } from './errors.ts';
import { toolsOf } from './refs.ts';
import { referencedTable, resolveAddress, splitPath, walk } from './navigate.ts';
import { deskField, DESK_ID, COMBAT_NAME } from './owners.ts';
import { collectModifiers, applyValueModifiers } from './modifiers.ts';
import { wornEffects } from './effects.ts';
import type { CollectedModifiers } from './modifiers.ts';
import type { System, Sheet, Field, Compendium, Resolve } from '../model/types.ts';
import { fieldsOf, fieldOf } from '../model/sheet-columns.ts';
import { tr } from '../words/tongue.ts';

export interface Pass {
  system: System;
  sheet: Sheet;
  memo: Map<string, unknown>;
  visiting: Set<string>;
  path: string[];
  computed: string[];
  modifiers: CollectedModifiers | null;
  resolve: Resolve;

  desk?: Pass;
  group?: Pass;
  round?: () => number | null;
  only?: Scope;
  compendium?: Compendium;
}

export interface PassOptions {
  compendium?: Compendium;
  modifiers?: CollectedModifiers;
  shared?: readonly Sheet[] | null;
  only?: Scope;
  combat?: () => boolean;
  round?: () => number | null;
  peer?: (id: string) => Pass | null;
}

export const livesOn = (field: Pick<Field, 'lives'> | null | undefined): 'sheet' | 'desk' | 'group' => field?.lives ?? 'sheet';

export type Scope = 'sheet' | 'desk' | 'group';

export const inScope = (field: Pick<Field, 'lives'>, scope: Scope): boolean =>
  (scope === 'sheet' ? livesOn(field) !== 'desk' : livesOn(field) === scope);

export const fieldsFor = (system: System, scope: Scope): Field[] => fieldsOf(system).filter(field => inScope(field, scope));

export const holderIdOf = (field: Pick<Field, 'lives'> | null | undefined, sheet: Pick<Sheet, 'group'>): string | null =>
  livesOn(field) === 'desk' ? DESK_ID : livesOn(field) === 'group' && sheet.group ? sheet.group : null;

export function findField(system: System, tag: string): Field | null {
  return fieldOf(system, tag) ?? null;
}

const isSheetField = (system: System, key: string): boolean =>
  Object.values(system.tables ?? {}).some(table => table.shape === 'single' && (table.columns ?? []).some(column => column.key === key && column.kind === 'sheet'));

export function newPass(system: System, sheet: Sheet, options: PassOptions = {}): Pass {
  const pass: Pass = {
    system,
    sheet,
    memo: new Map<string, unknown>(),
    visiting: new Set<string>(),
    path: [],
    computed: [],
    modifiers: null,

    resolve: () => undefined,
    ...(options.only ? { only: options.only } : {}),
    ...(options.compendium ? { compendium: options.compendium } : {}),
    ...(options.round ? { round: options.round } : {}),
  };

  const deskSheet = options.shared?.find(s => s.id === DESK_ID);
  if (deskSheet && sheet.id !== DESK_ID) pass.desk = newPass(system, deskSheet, { only: 'desk', ...(options.combat ? { combat: options.combat } : {}) });
  const groupSheet = sheet.group ? options.shared?.find(s => s.id === sheet.group) : undefined;
  if (groupSheet && groupSheet.id !== sheet.id) {
    pass.group = newPass(system, groupSheet, { compendium: options.compendium, shared: options.shared?.filter(s => s.id !== groupSheet.id) });
  }

  pass.resolve = tag => {
    const onDesk = deskField(tag);
    if (onDesk === COMBAT_NAME && !findField(system, COMBAT_NAME)) return options.combat?.() ?? false;
    if (onDesk) {
      if (sheet.id === DESK_ID) return pass.resolve(onDesk);
      if (!pass.desk) throw new EngineError(tr`стола нет — «${onDesk}» читать неоткуда`);
      return pass.desk.resolve(onDesk);
    }
    const field = findField(system, tag);
    if (!field && system.effects?.[tag]) return wornCount(system, sheet, tag, options.compendium);
    const address = field ? null : resolveAddress(system, pass, tag);
    if (address) return address.value;
    const split = field ? null : splitPath(tag);
    const head = split ? findField(system, split.head) : null;
    if (split && head && isSheetField(system, split.head)) {
      const id = calc(system, sheet, split.head, pass);
      if (id === null || id === undefined || id === '') return null;
      const other = options.peer?.(String(id));
      if (!other) throw new EngineError(tr`«${head.label}»: листа «${String(id)}» нет — «${split.path.join('.')}» прочитать не у кого`);
      return other.resolve(split.path.join('.'));
    }
    const table = split ? referencedTable(system, split.head) : undefined;
    if (split && table) {
      return walk(system, pass, table, calc(system, sheet, split.head, pass), split.path, tr`поле «${split.head}»`);
    }
    return calc(system, sheet, tag, pass);
  };

  if (options.compendium) pass.modifiers = collectModifiers(system, sheet, options.compendium);
  else if (options.modifiers) pass.modifiers = options.modifiers;

  return pass;
}

export const wornCount = (system: System, sheet: Sheet, id: string, compendium?: Compendium | null): number =>
  wornEffects(system, sheet, { strict: false, compendium: compendium ?? null }).filter(worn => worn.id === id).length;

export function calc(system: System, sheet: Sheet, tag: string, pass: Pass = newPass(system, sheet)): unknown {
  const field = findField(system, tag);
  if (!field || (pass.only && !inScope(field, pass.only))) throw new UnknownTagError(tag, pass.path[pass.path.length - 1]);
  if (livesOn(field) === 'group' && pass.group) return calc(system, pass.group.sheet, tag, pass.group);

  if (pass.memo.has(tag)) return pass.memo.get(tag);
  if (pass.visiting.has(tag)) throw new CycleError([...pass.path, tag]);

  pass.visiting.add(tag);
  pass.path.push(tag);
  try {
    const value = applyValueModifiers(computeBase(field, pass), tag, pass, [], field.cell);
    pass.memo.set(tag, value);
    pass.computed.push(tag);
    return value;
  } finally {
    pass.visiting.delete(tag);
    pass.path.pop();
  }
}

export function calcAll(system: System, sheet: Sheet, pass: Pass = newPass(system, sheet)): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of pass.only ? fieldsFor(system, pass.only) : fieldsOf(system)) out[field.tag] = calc(system, sheet, field.tag, pass);
  return out;
}

export function dependenciesOf(system: System, tag: string): string[] {
  const field = findField(system, tag);
  if (!field) throw new UnknownTagError(tag);
  const source = field.value;
  if (source.kind === 'formula') return [...compile(source.expr).deps];
  return source.start ? [...compile(source.start).deps] : [];
}

function computeBase(field: Field, pass: Pass): unknown {
  const source = field.value;
  const resolve: Resolve = tag => pass.resolve(tag);

  switch (source.kind) {
    case 'stored':
      return baseOf(pass, field);

    case 'formula':
      return compile(source.expr).evaluate(resolve, toolsOf(pass.system, pass, field.tag));

    default:
      throw new EngineError(
        tr`поле «${field.tag}»: неизвестный способ получить значение «${(source as { kind: string }).kind}»`);
  }
}

export function baseOf(pass: Pass, field: Field): unknown {
  const values = pass.sheet.values || {};
  if (Object.prototype.hasOwnProperty.call(values, field.tag)) return values[field.tag];
  if (field.value.kind !== 'stored') return undefined;
  if (!field.value.start) return field.value.default;
  return compile(field.value.start).evaluate(tag => pass.resolve(tag), toolsOf(pass.system, pass, field.tag));
}
