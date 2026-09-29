import type { ValueKind } from '../model/types.ts';

export type Kind = ValueKind;

export type KindPlace = 'field' | 'table' | 'prop' | 'param';

export const KIND_LABEL: Record<Kind, string> = {
  number: 'число',
  text: 'слово',
  boolean: 'да / нет',
  expr: 'формула',
  dice: 'кость',
  choice: 'из таблицы',
  effect: 'эффект',
  record: 'запись',
  tag: 'поле листа',
};

const ORDER: Kind[] = ['number', 'text', 'boolean', 'expr', 'dice', 'choice', 'effect', 'record', 'tag'];

const ALLOWED: Record<KindPlace, Kind[]> = {
  field: ['number', 'text', 'boolean', 'choice'],
  table: ['number', 'text', 'boolean', 'dice', 'choice', 'effect', 'tag'],
  prop: ['number', 'text', 'boolean', 'expr', 'dice', 'choice', 'effect', 'record'],
  param: ['number', 'text', 'boolean', 'dice', 'choice', 'effect', 'tag'],
};

export const kindsFor = (place: KindPlace): readonly (readonly [Kind, string])[] =>
  ORDER.filter(kind => ALLOWED[place].includes(kind)).map(kind => [kind, KIND_LABEL[kind]] as const);

export const kindWord = (kind: string | undefined): string => KIND_LABEL[(kind ?? 'number') as Kind] ?? String(kind);

export const isReference = (kind: string | undefined): boolean =>
  kind === 'choice' || kind === 'effect' || kind === 'record' || kind === 'tag';
