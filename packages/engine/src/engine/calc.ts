import { compile } from '../formula/index.ts';
import { UnknownTagError, CycleError, EngineError } from './errors.ts';
import { readCell } from './cells.ts';
import { VALUE_COLUMN } from '../model/tables.ts';
import { collectModifiers, applyValueModifiers } from './modifiers.ts';
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
}

export interface PassOptions {
  compendium?: Compendium;
  modifiers?: CollectedModifiers;
}

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

  pass.resolve = tag => calc(system, sheet, tag, pass);

  if (options.compendium) pass.modifiers = collectModifiers(system, sheet, options.compendium);
  else if (options.modifiers) pass.modifiers = options.modifiers;

  return pass;
}

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
  if (source.kind === 'table') return [...compile(source.arg).deps];
  return [];
}

function computeBase(field: Field, pass: Pass): unknown {
  const source = field.value;
  const resolve: Resolve = tag => calc(pass.system, pass.sheet, tag, pass);

  switch (source.kind) {
    case 'stored':
      return readStored(pass.sheet, field);

    case 'formula':
      return compile(source.expr).evaluate(resolve);

    case 'table':
      return readCell(pass.system, pass, source.table, compile(source.arg).evaluate(resolve), source.column ?? VALUE_COLUMN, field.tag);

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
