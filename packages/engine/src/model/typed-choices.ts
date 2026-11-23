import type { System, Field } from './types.ts';
import type { NameAt, NameGroup } from './names-at.ts';
import { fieldsOf, fieldLinkOf, columnOfField, onSheet } from './sheet-columns.ts';
import { columnChoices } from './paths.ts';
import { listOf } from './lists.ts';
import { tr, live } from '../words/tongue.ts';

export interface Want { kind: string; from?: string; many?: boolean }

export interface TypedChoice { expr: string; label: string; group: string }

export const TYPED_KINDS: readonly string[] = ['sheet', 'choice', 'roll', 'dice', 'record'];

export const isTyped = (kind: string | undefined): boolean => TYPED_KINDS.includes(kind ?? '');

const GROUP: Record<NameGroup, string> = live({
  input: 'входы эффекта',
  loop: 'для каждого из',
  holder: 'носитель',
  heard: 'что случилось',
  step: 'шаги',
  call: 'вызов',
  constant: 'кости системы',
});

const sameKind = (kind: string | undefined, want: string): boolean =>
  kind === want || (want === 'dice' && (kind === 'die' || kind === 'dice'));

const fits = (one: { kind?: string; from?: string; many?: boolean }, want: Want): boolean => {
  if (!sameKind(one.kind, want.kind)) return false;
  if (want.kind === 'sheet') return Boolean(one.many) === Boolean(want.many);
  if ((want.kind === 'choice' || want.kind === 'record') && want.from) return one.from === want.from;
  return true;
};

const kindOfField = (system: System, field: Field): { kind: string; from?: string } => {
  const column = columnOfField(system, field);
  if (column?.kind) return { kind: column.kind, ...(column.from ? { from: column.from } : {}) };
  if (field.value.kind === 'stored') return { kind: field.value.type, ...(field.value.from ? { from: field.value.from } : {}) };
  return { kind: 'number' };
};

function onSheetChoices(system: System, sheet: NameAt, names: readonly NameAt[], want: Want): TypedChoice[] {
  const out: TypedChoice[] = [];
  const group = sheet.label;
  const on = (label: string) => `${sheet.label} → ${label}`;
  for (const field of fieldsOf(system)) {
    if (field.lives) continue;
    const label = field.label || field.tag;
    if (fits(kindOfField(system, field), want)) out.push({ expr: `@${sheet.name}.${field.tag}`, label: on(label), group });
    const link = fieldLinkOf(system, field);
    if (!link) continue;
    for (const one of columnChoices(system, link)) {
      if (fits(one, want)) out.push({ expr: `@${sheet.name}.${field.tag}${one.path}`, label: on(`${label} → ${one.label}`), group });
    }
  }
  for (const row of names) {
    if (!row.from || !onSheet(system.tables?.[row.from])) continue;
    for (const child of row.children ?? []) {
      if (fits(child, want)) out.push({ expr: `@${sheet.name}.${row.name}${child.path}`, label: on(`${row.label} → ${child.label}`), group });
    }
  }
  return out;
}

export function typedChoices(system: System, names: readonly NameAt[], want: Want): TypedChoice[] {
  const out: TypedChoice[] = [];
  if (want.kind === 'choice' && want.from) {
    const table = system.tables?.[want.from];
    const group = tr`строка «${table?.label || want.from}»`;
    for (const row of listOf(system, want.from) ?? []) out.push({ expr: JSON.stringify(row.value), label: row.label, group });
  }
  for (const one of names) {
    if (want.kind === 'dice' && one.group === 'constant') continue;
    const said = one.group === 'step' && one.label.toLowerCase() !== (one.said ?? one.name.replace(/_/g, ' ')).toLowerCase() ? `${one.label} «${one.said ?? one.name.replace(/_/g, ' ')}»` : one.label;
    if (fits(one, want) || (one.whole && fits({ kind: one.whole }, want))) out.push({ expr: `@${one.name}`, label: said, group: GROUP[one.group] });
    for (const child of one.children ?? []) {
      if (fits(child, want)) out.push({ expr: `@${one.name}${child.path}`, label: `${said} → ${child.label}`, group: GROUP[one.group] });
    }
  }
  if (want.kind === 'sheet' && !want.many) {
    for (const list of names.filter(one => one.kind === 'sheet' && one.many)) {
      out.push({ expr: `first(@${list.name})`, label: tr`первый из «${list.label}»`, group: GROUP[list.group] });
    }
  }
  if (want.kind !== 'sheet') {
    for (const sheet of names.filter(one => one.kind === 'sheet' && !one.many)) out.push(...onSheetChoices(system, sheet, names, want));
  }
  const seen = new Set<string>();
  const unique = out.filter(one => (seen.has(one.expr) ? false : (seen.add(one.expr), true)));
  const order = [...new Set(unique.map(one => one.group))];
  return order.flatMap(group => unique.filter(one => one.group === group));
}
