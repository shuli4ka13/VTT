import { isSingle } from '@vtt/engine/model/sheet-columns';
import type { Effect, System } from '@vtt/schema';

export interface Rollable { tail: string; label: string; group: string; rule: string }

export const BY_INPUT = 'По входу эффекта';
export const ON_SHEET = 'Поля листа';

export function rollableFields(system: System, effect: Effect): Rollable[] {
  const inputs: Rollable[] = [];
  const singles: Rollable[] = [];
  const rows: Rollable[] = [];
  for (const [key, roll] of Object.entries(system.rolls ?? {})) {
    const rule = roll.label || key;
    for (const one of roll.fields) {
      const table = system.tables?.[one.table];
      if (!table) continue;
      const name = table.columns?.find(column => column.key === one.column)?.label || one.column;
      if (isSingle(table)) { singles.push({ tail: one.column, label: name, group: ON_SHEET, rule }); continue; }
      for (const param of effect.params ?? []) {
        if (param.kind === 'choice' && param.from === one.table) inputs.push({ tail: `${param.key}.${one.column}`, label: `${param.label || param.key} → ${name}`, group: BY_INPUT, rule });
      }
      for (const row of (table.rows ?? []).filter(one => /^[\p{L}\p{N}_]+$/u.test(String(one.value)))) rows.push({ tail: `${one.table}.${row.value}.${one.column}`, label: `${row.label || row.value} → ${name}`, group: table.label || one.table, rule });
    }
  }
  return [...inputs, ...singles, ...rows];
}

export const DIE = 'die:';
export const EXPR = 'expr:';
export const FIELD = 'field:';
export const OWN_DIE = 'own-die';
export const OWN_FIELD = 'own-field';

export type WhatOption = readonly [string, string, string];

export function whatOptions(system: System, effect: Effect): WhatOption[] {
  const fields = rollableFields(system, effect);
  const lead = fields.filter(one => one.group === BY_INPUT || one.group === ON_SHEET);
  const rows = fields.filter(one => !lead.includes(one));
  const dice = Object.entries(system.constants ?? {}).filter(([, constant]) => constant.kind === 'die');
  const inputs = (effect.params ?? []).filter(param => param.kind === 'dice');
  return [
    ...lead.map(one => [`${FIELD}${one.tail}`, one.label, one.group] as const),
    ...dice.map(([key, constant]) => [`${DIE}${key}`, constant.label || key, 'Кости'] as const),
    ...inputs.map(param => [`${EXPR}@${param.key}`, param.label || param.key, 'Кость из входа'] as const),
    ...rows.map(one => [`${FIELD}${one.tail}`, one.label, one.group] as const),
    [OWN_DIE, 'своя кость…', 'Другое'] as const,
    ...(fields.length ? [[OWN_FIELD, 'поле своим адресом…', 'Другое'] as const] : []),
  ];
}

const exprOf = (value: unknown): string => String((value as { expr?: unknown } | undefined)?.expr ?? '');

const TAIL = /^\s*@[\p{L}\p{N}_]+\.(.+?)\s*$/u;
const HEAD = /^\s*(@[\p{L}\p{N}_]+)/u;

export const tailOf = (address: string): string => TAIL.exec(address)?.[1] ?? '';
export const headOf = (address: string): string => HEAD.exec(address)?.[1] ?? '';

export function whatOf(step: Record<string, unknown>, options: readonly WhatOption[]): string {
  const has = (value: string): boolean => options.some(([key]) => key === value);
  if (step.field !== undefined) {
    const tail = tailOf(exprOf(step.field));
    if (!tail) return '';
    return has(`${FIELD}${tail}`) ? `${FIELD}${tail}` : OWN_FIELD;
  }
  if (typeof step.die === 'string') return `${DIE}${step.die}`;
  if (step.die && typeof step.die === 'object') {
    const text = exprOf(step.die).trim();
    return has(`${EXPR}${text}`) ? `${EXPR}${text}` : OWN_DIE;
  }
  return '';
}

export function setDie(step: Record<string, unknown>, die: unknown): void {
  if (step.field !== undefined) {
    const head = headOf(exprOf(step.field));
    delete step.field;
    delete step.shift;
    if (head) step.by = { expr: head };
  }
  delete step.fixed;
  step.die = die;
}

export function setField(step: Record<string, unknown>, tail: string, firstSheet: string | undefined): void {
  const head = step.field !== undefined ? headOf(exprOf(step.field)) : headOf(exprOf(step.by)) || (firstSheet ? `@${firstSheet}` : '');
  if (!head && !tail) return;
  delete step.die;
  delete step.count;
  delete step.bonus;
  delete step.fixed;
  delete step.by;
  step.field = { expr: tail ? `${head}.${tail}` : head };
}

export function setWho(step: Record<string, unknown>, who: string): void {
  if (step.field !== undefined) {
    const tail = tailOf(exprOf(step.field));
    step.field = { expr: tail ? `${who}.${tail}` : who };
    return;
  }
  if (who) step.by = { expr: who }; else delete step.by;
}
