import type { ValueKind } from '../model/types.ts';

export type Kind = ValueKind;

export type KindPlace = 'field' | 'table' | 'prop' | 'param';

export const KIND_LABEL: Record<Kind, string> = {
  number: 'число',
  text: 'слово',
  boolean: 'да / нет',
  dice: 'кость',
  choice: 'из таблицы',
  effect: 'эффект',
  record: 'запись',
  field: 'поле листа',
  table: 'таблица',
  column: 'колонка таблицы',
  sheet: 'лист',
  roll: 'бросок',
};

const ORDER: Kind[] = ['number', 'text', 'boolean', 'dice', 'roll', 'choice', 'effect', 'record', 'field', 'table', 'column', 'sheet'];

const ALLOWED: Record<KindPlace, Kind[]> = {
  field: ['number', 'text', 'boolean', 'choice'],
  table: ['number', 'text', 'boolean', 'dice', 'choice', 'effect', 'field', 'table', 'column'],
  prop: ['number', 'text', 'boolean', 'dice', 'choice', 'effect', 'record'],
  param: ['number', 'text', 'boolean', 'dice', 'roll', 'choice', 'effect', 'field', 'sheet'],
};

export const kindsFor = (place: KindPlace): readonly (readonly [Kind, string])[] =>
  ORDER.filter(kind => ALLOWED[place].includes(kind)).map(kind => [kind, KIND_LABEL[kind]] as const);

export const kindWord = (kind: string | undefined): string => KIND_LABEL[(kind ?? 'number') as Kind] ?? String(kind);

export const isReference = (kind: string | undefined): boolean =>
  kind === 'choice' || kind === 'effect' || kind === 'record' || kind === 'field' || kind === 'table' || kind === 'column' || kind === 'sheet';
