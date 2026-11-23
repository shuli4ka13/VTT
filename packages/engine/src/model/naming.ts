import type { Where } from './references.ts';
import type { System, Compendium } from './types.ts';
import { tr } from '../words/tongue.ts';

export interface NamingProblem {
  where: Where;
  level: 'error' | 'warn';
  text: string;
}

const LATIN_KEY = /^[a-z][a-z0-9_]*$/iu;

const named = (label: unknown): boolean => typeof label === 'string' && label.trim() !== '';

export const NO_NAME = (what: string, key: string): string => tr`у ${what} «${key}» нет названия — на экране будет виден ключ`;
export const NAME_IS_KEY = (what: string, key: string): string => tr`название ${what} совпадает с ключом «${key}» — впишите название словами`;
export const KEYS_AS_TEXT = (table: string, column: string): string =>
  tr`колонка «${column}» таблицы «${table}» хранит ключи записей текстом — на экране виден ключ; впишите названия словами`;

export function namingProblems(system: System, compendium?: Compendium): NamingProblem[] {
  const out: NamingProblem[] = [];
  const check = (what: string, key: string, label: unknown, where: Where): void => {
    const own = key.split('.').pop()!;
    if (!named(label)) out.push({ where, level: 'error', text: NO_NAME(what, key) });
    else if (LATIN_KEY.test(own) && String(label).trim().toLowerCase() === own.toLowerCase()) out.push({ where, level: 'warn', text: NAME_IS_KEY(what, own) });
  };

  for (const [key, table] of Object.entries(system.tables ?? {})) {
    const where: Where = { tab: 'rules', section: 'tables', key };
    if (table.shape !== 'single') check(tr`таблицы`, key, table.label, where);
    for (const column of table.columns ?? []) check(tr`колонки`, `${key}.${column.key}`, column.label, where);
  }
  for (const [key, effect] of Object.entries(system.effects ?? {})) {
    const where: Where = { tab: 'effects', effect: key };
    check(tr`эффекта`, key, effect.label, where);
    for (const param of effect.params ?? []) check(tr`входа`, `${key}.${param.key}`, param.label, { ...where, part: 'params' });
    for (const one of effect.returns ?? []) check(tr`итога`, `${key}.${one.key}`, one.label, { ...where, part: 'returns' });
  }
  for (const [key, constant] of Object.entries(system.constants ?? {})) check(tr`кости`, key, constant.label, { tab: 'rules', section: 'rolls', key });
  for (const [key, roll] of Object.entries(system.rolls ?? {})) check(tr`броска`, key, roll.label, { tab: 'rules', section: 'rolls', key });
  for (const [key, edit] of Object.entries(system.roll_edits ?? {})) check(tr`правки броска`, key, edit.label, { tab: 'rules', section: 'roll_edits', key });
  for (const [key, kind] of Object.entries(system.sheets ?? {})) check(tr`типа листа`, key, kind.label, { tab: 'records', kind: key });

  const records = [...(system.library ?? []), ...(compendium?.records ?? [])];
  for (const record of records) check(tr`записи`, record.id, record.label, { tab: 'book', record: record.id });

  const ids = new Set(records.map(record => record.id));
  for (const [key, table] of Object.entries(system.tables ?? {})) {
    for (const column of table.columns ?? []) {
      if ((column.kind ?? 'text') !== 'text') continue;
      const values = (table.rows ?? []).map(row => row.cells?.[column.key]).filter((value): value is string => typeof value === 'string' && value !== '');
      if (values.length >= 2 && values.every(value => ids.has(value))) {
        out.push({ where: { tab: 'rules', section: 'tables', key }, level: 'warn', text: KEYS_AS_TEXT(table.label || key, column.label || column.key) });
      }
    }
  }
  return out;
}
