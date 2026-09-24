import { compile } from '../formula/index.ts';
import { UnknownTagError, CycleError, EngineError } from './errors.ts';
import { toolsOf } from './refs.ts';
import { referencedTable, splitPath, walk } from './navigate.ts';
import { ownerOf, DESK } from './owners.ts';
import { collectModifiers, applyValueModifiers } from './modifiers.ts';
import { wornEffects } from './effects.ts';
import type { CollectedModifiers } from './modifiers.ts';
import type { System, Sheet, Field, Compendium, Resolve } from '../model/types.ts';

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
}

export interface PassOptions {
  compendium?: Compendium;
  modifiers?: CollectedModifiers;
  desk?: Sheet | null;
}

export const deskSystemOf = (system: System): System => ({ ...system, fields: system.fields.filter(f => f.desk) });

export const sheetSystemOf = (system: System): System => ({ ...system, fields: system.fields.filter(f => !f.desk) });

export function findField(system: System, tag: string): Field | null {
  return system.fields.find(f => f.tag === tag) || null;
}

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
  };

  if (options.desk) pass.desk = newPass(deskSystemOf(system), options.desk);

  pass.resolve = tag => {
    const owned = ownerOf(tag);
    if (owned?.owner === DESK) {
      if (!pass.desk) throw new EngineError(`стола нет — «${owned.rest}» читать неоткуда`);
      return pass.desk.resolve(owned.rest);
    }
    if (!findField(system, tag) && system.effects?.[tag]) return wornCount(system, sheet, tag, options.compendium);
    const split = findField(system, tag) ? null : splitPath(tag);
    const table = split ? referencedTable(system, split.head) : undefined;
    if (split && table) {
      return walk(system, pass, table, calc(system, sheet, split.head, pass), split.path, `поле «${split.head}»`);
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
  if (!field) throw new UnknownTagError(tag, pass.path[pass.path.length - 1]);

  if (pass.memo.has(tag)) return pass.memo.get(tag);
  if (pass.visiting.has(tag)) throw new CycleError([...pass.path, tag]);

  pass.visiting.add(tag);
  pass.path.push(tag);
  try {
    const value = applyValueModifiers(computeBase(field, pass), tag, pass);
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
  for (const field of system.fields) out[field.tag] = calc(system, sheet, field.tag, pass);
  return out;
}

export function dependenciesOf(system: System, tag: string): string[] {
  const field = findField(system, tag);
  if (!field) throw new UnknownTagError(tag);
  const source = field.value;
  if (source.kind === 'formula') return [...compile(source.expr).deps];
  return [];
}

function computeBase(field: Field, pass: Pass): unknown {
  const source = field.value;
  const resolve: Resolve = tag => pass.resolve(tag);

  switch (source.kind) {
    case 'stored':
      return readStored(pass.sheet, field);

    case 'formula':
      return compile(source.expr).evaluate(resolve, toolsOf(pass.system, pass, field.tag));

    default:
      throw new EngineError(
        `поле «${field.tag}»: неизвестный способ получить значение «${(source as { kind: string }).kind}»`);
  }
}

function readStored(sheet: Sheet, field: Field): unknown {
  const values = sheet.values || {};
  if (Object.prototype.hasOwnProperty.call(values, field.tag)) return values[field.tag];
  return field.value.kind === 'stored' ? field.value.default : undefined;
}
