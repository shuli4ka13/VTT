export type Kind = 'number' | 'text' | 'expr' | 'dice' | 'choice' | 'effect' | 'record' | 'tag';

export type KindPlace = 'table' | 'prop' | 'param';

export const KIND_LABEL: Record<Kind, string> = {
  number: 'число',
  text: 'слово',
  expr: 'формула',
  dice: 'кость',
  choice: 'из таблицы',
  effect: 'эффект',
  record: 'запись',
  tag: 'поле листа',
};

const ORDER: Kind[] = ['number', 'text', 'expr', 'dice', 'choice', 'effect', 'record', 'tag'];

const ALLOWED: Record<KindPlace, Kind[]> = {
  table: ['number', 'text', 'expr', 'dice', 'choice', 'effect', 'tag'],
  prop: ['number', 'text', 'expr', 'dice', 'choice', 'effect', 'record'],
  param: ['number', 'text', 'dice', 'choice', 'effect'],
};

export const kindsFor = (place: KindPlace): readonly (readonly [Kind, string])[] =>
  ORDER.filter(kind => ALLOWED[place].includes(kind)).map(kind => [kind, KIND_LABEL[kind]] as const);

export const isReference = (kind: string | undefined): boolean =>
  kind === 'choice' || kind === 'effect' || kind === 'record' || kind === 'tag';
