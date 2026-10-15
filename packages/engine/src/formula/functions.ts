import { lex } from './lex.ts';
import type { Token } from './lex.ts';
export type Result = 'number' | 'bool' | 'list' | 'any';

export interface Part { label: string; hint: string; optional?: true; many?: true }

export interface FunctionSpec { name: string; hint: string; result: Result; parts: readonly Part[] }

const one = (label: string, hint: string): Part => ({ label, hint });
const maybe = (label: string, hint: string): Part => ({ label, hint, optional: true });
const many = (label: string, hint: string): Part => ({ label, hint, many: true });

const NUMBER = one('число', 'что округлить или взять без знака');
const VALUES = many('значения', 'через запятую — числа, поля или список');

export const FUNCTIONS: readonly FunctionSpec[] = [
  { name: 'если', result: 'any', hint: 'если условие верно — первое, иначе второе', parts: [
    one('условие', 'да или нет: что проверяем'), one('то', 'что получится, если условие верно'), one('иначе', 'что получится, если нет'),
  ] },
  { name: 'округлить вниз', result: 'number', hint: 'отбросить дробную часть: 7,9 → 7', parts: [NUMBER] },
  { name: 'округлить вверх', result: 'number', hint: 'добить до целого: 7,1 → 8', parts: [NUMBER] },
  { name: 'округлить', result: 'number', hint: 'по школьным правилам: 7,5 → 8, 7,4 → 7', parts: [NUMBER] },
  { name: 'модуль', result: 'number', hint: 'число без минуса: −3 → 3', parts: [NUMBER] },
  { name: 'меньшее из', result: 'number', hint: 'самое маленькое из перечисленного', parts: [VALUES] },
  { name: 'большее из', result: 'number', hint: 'самое большое из перечисленного', parts: [VALUES] },
  { name: 'сумма', result: 'number', hint: 'сложить всё перечисленное', parts: [VALUES] },
  { name: 'среднее', result: 'number', hint: 'среднее перечисленного', parts: [VALUES] },
  { name: 'сколько', result: 'number', hint: 'сколько значений в списке', parts: [
    one('список', 'что считаем: список, итоги по целям, выпавшие кости'), maybe('что считать', 'если указано — сколько из них равны ему'),
  ] },
  { name: 'строки', result: 'list', hint: 'значения колонки по всем строкам таблицы', parts: [
    one('таблица', 'название таблицы в кавычках'), one('колонка', 'название колонки в кавычках'), maybe('вещь', 'чьи строки: у какой вещи'),
  ] },
  { name: 'пересекаются', result: 'bool', hint: 'есть ли у двух списков общее', parts: [one('список', 'первый список'), one('список', 'второй список')] },
  { name: 'есть', result: 'bool', hint: 'есть ли в списке значение', parts: [one('список', 'где ищем'), one('значение', 'что ищем')] },
  { name: 'первый', result: 'any', hint: 'первое заданное значение списка', parts: [one('список', 'откуда берём')] },
  { name: 'пусто', result: 'bool', hint: 'да, если значение не задано', parts: [one('значение', 'что проверяем')] },
  { name: 'таблица', result: 'any', hint: 'взять из таблицы строку по значению', parts: [
    one('таблица', 'название таблицы в кавычках'), one('по чему искать', 'значение, по которому найти строку'), maybe('колонка', 'какую колонку взять; без неё — значение строки'),
  ] },
  { name: 'кинуть', result: 'number', hint: 'бросить кости', parts: [
    one('кость', 'например к20 или 2к6'), maybe('сколько раз', 'сколько таких бросков сложить'), maybe('сколько оставить', 'сколько лучших костей оставить; с минусом — худших'),
  ] },
  { name: 'максимум костей', result: 'number', hint: 'сколько выпало бы на максимуме', parts: [
    one('кость', 'например 1к8'), maybe('сколько раз', 'сколько таких костей'),
  ] },
];

const BY_NAME = new Map(FUNCTIONS.map(spec => [spec.name, spec]));

export const functionSpec = (name: string): FunctionSpec | undefined => BY_NAME.get(name);

export function partAt(spec: FunctionSpec, index: number): Part | undefined {
  const last = spec.parts[spec.parts.length - 1];
  return spec.parts[index] ?? (last?.many ? last : undefined);
}

export function callAt(before: string): { spec: FunctionSpec; index: number } | null {
  let tokens: Token[];
  try { tokens = lex(before); } catch { return null; }
  const stack: { name: string | null; index: number }[] = [];
  tokens.forEach((token, at) => {
    if (token.type === 'lparen') {
      const prev = tokens[at - 1];
      stack.push({ name: prev?.type === 'ident' ? String(prev.value) : null, index: 0 });
    } else if (token.type === 'rparen') stack.pop();
    else if (token.type === 'comma' && stack.length) stack[stack.length - 1]!.index++;
  });
  for (let at = stack.length - 1; at >= 0; at--) {
    const frame = stack[at]!;
    const spec = frame.name ? functionSpec(frame.name) : undefined;
    if (spec) return { spec, index: frame.index };
  }
  return null;
}
