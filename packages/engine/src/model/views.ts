import type { ControlKind } from '@vtt/schema';
import type { TableColumn } from './types.ts';

export type ValueFamily = 'number' | 'boolean' | 'choice' | 'many' | 'dice' | 'text';

export const VIEW_KINDS: ControlKind[] = ['signed', 'big', 'stepper', 'slider', 'pips', 'charges', 'bar', 'toggle', 'ring', 'choice', 'chips', 'die'];

export const VIEW_LABELS: Record<ControlKind, string> = {
  signed: 'Со знаком', big: 'Крупно', stepper: 'Минус и плюс', slider: 'Ползунок', pips: 'Точки', charges: 'Круг зарядов',
  bar: 'Полоса', toggle: 'Переключатель', ring: 'Кружок ступеней', choice: 'Кнопки выбора', chips: 'Метки', die: 'Кость',
};

export const SHOWS_ONLY: ControlKind[] = ['signed', 'big', 'pips', 'charges', 'bar', 'toggle', 'chips'];

export const FITTING: Record<ValueFamily, ControlKind[]> = {
  number: ['signed', 'big', 'stepper', 'slider', 'pips', 'charges', 'bar'],
  boolean: ['toggle'],
  choice: ['ring', 'choice'],
  many: ['chips'],
  dice: ['die'],
  text: ['die'],
};

export const TAKES_BOUNDS: ControlKind[] = ['stepper', 'slider', 'pips', 'charges', 'bar'];

export const TAKES_STEP: ControlKind[] = ['stepper', 'slider'];

export function familyOf(kind: string | undefined, many: boolean | undefined, computed: boolean): ValueFamily | null {
  if (!kind) return computed ? null : 'number';
  if (kind === 'choice') return many ? 'many' : 'choice';
  if (kind === 'number' || kind === 'boolean' || kind === 'dice' || kind === 'text') return kind;
  return null;
}

export function viewsFor(family: ValueFamily | null, computed: boolean): ControlKind[] {
  const fitting = family ? FITTING[family] : VIEW_KINDS;
  return VIEW_KINDS.filter(key => fitting.includes(key) && (!computed || SHOWS_ONLY.includes(key)));
}

export function columnFamily(column: Pick<TableColumn, 'kind' | 'many' | 'expr'>): ValueFamily | null {
  return familyOf(column.kind ?? (column.expr === undefined ? 'number' : undefined), column.many, column.expr !== undefined);
}

export function viewNeeds(kind: ControlKind, column: Pick<TableColumn, 'kind' | 'many' | 'from' | 'min' | 'max'>): string[] {
  const out: string[] = [];
  if ((kind === 'pips' || kind === 'charges' || kind === 'bar' || kind === 'slider') && column.max === undefined) out.push('верх');
  if (kind === 'slider' && column.min === undefined) out.push('низ');
  if ((kind === 'ring' || kind === 'choice' || kind === 'chips') && !column.from) out.push('таблица вариантов');
  return out;
}
