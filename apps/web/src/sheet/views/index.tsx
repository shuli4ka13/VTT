import type { ReactNode } from 'react';
import type { Control, FieldOption } from '@vtt/schema';
import { Signed, Big, Stepper, Slider, Pips, Charges, Bar } from './number.tsx';
import { Toggle, Ring, Choice, Chips, Die } from './pick.tsx';
import type { ViewProps } from './kit.ts';

export type { ViewProps } from './kit.ts';

export type ValueFamily = 'number' | 'boolean' | 'choice' | 'many' | 'dice' | 'text';

export interface ViewSpec {
  label: string;
  hint: string;
  shows: boolean;
  fits: (value: unknown) => boolean;
  draw: (props: ViewProps) => ReactNode;
  sample: { value: unknown; min?: number; max?: number; options?: FieldOption[] };
}

const isNumber = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value);

const SAMPLE_STEPS: FieldOption[] = [{ value: 0, label: 'нет' }, { value: 1, label: 'владение' }, { value: 2, label: 'мастер' }];
const SAMPLE_PICKS: FieldOption[] = [{ value: 'a', label: 'огонь' }, { value: 'b', label: 'холод' }, { value: 'c', label: 'яд' }];

export const VIEWS: Record<Control, ViewSpec> = {
  signed: { label: 'Со знаком', hint: 'модификатор: +3, −1', shows: true, fits: isNumber, draw: Signed, sample: { value: 3 } },
  big: { label: 'Крупно', hint: 'главное число: КД, инициатива', shows: true, fits: isNumber, draw: Big, sample: { value: 16 } },
  stepper: { label: 'Минус и плюс', hint: 'точный счёт: патроны, заряды', shows: false, fits: isNumber, draw: Stepper, sample: { value: 12, min: 0, max: 30 } },
  slider: { label: 'Ползунок', hint: 'плавный выбор в пределах', shows: false, fits: isNumber, draw: Slider, sample: { value: 3, min: 1, max: 9 } },
  pips: { label: 'Точки', hint: 'запас из максимума: ячейки, удача', shows: true, fits: isNumber, draw: Pips, sample: { value: 3, max: 5 } },
  charges: { label: 'Круг зарядов', hint: 'заряды, «раз в день»', shows: true, fits: isNumber, draw: Charges, sample: { value: 4, max: 6 } },
  bar: { label: 'Полоса', hint: 'хиты: цвет по остатку', shows: true, fits: isNumber, draw: Bar, sample: { value: 27, max: 45 } },
  toggle: { label: 'Переключатель', hint: 'да или нет: концентрация, режим', shows: true, fits: value => typeof value === 'boolean' || value === 0 || value === 1, draw: Toggle, sample: { value: true } },
  ring: { label: 'Кружок ступеней', hint: 'по кругу: нет → владение → мастер', shows: false, fits: () => true, draw: Ring, sample: { value: 1, options: SAMPLE_STEPS } },
  choice: { label: 'Кнопки выбора', hint: 'одно из нескольких: режим, множитель', shows: false, fits: () => true, draw: Choice, sample: { value: 1, options: SAMPLE_STEPS } },
  chips: { label: 'Метки', hint: 'несколько сразу: сопротивления', shows: true, fits: () => true, draw: Chips, sample: { value: ['a', 'c'], options: SAMPLE_PICKS } },
  die: { label: 'Кость', hint: 'кость хитов, кость урона', shows: false, fits: value => typeof value === 'string', draw: Die, sample: { value: '1к8' } },
};

export const VIEW_KEYS = Object.keys(VIEWS) as Control[];

const FITTING: Record<ValueFamily, Control[]> = {
  number: ['signed', 'big', 'stepper', 'slider', 'pips', 'charges', 'bar', 'toggle', 'ring'],
  boolean: ['toggle'],
  choice: ['choice', 'ring'],
  many: ['chips'],
  dice: ['die'],
  text: ['die'],
};

export function viewsFor(family: ValueFamily | null, computed: boolean): Control[] {
  const fitting = family ? FITTING[family] : VIEW_KEYS;
  return VIEW_KEYS.filter(key => fitting.includes(key) && (!computed || VIEWS[key].shows));
}

export function familyOf(kind: string | undefined, many: boolean | undefined, computed: boolean): ValueFamily | null {
  if (!kind) return computed ? null : 'number';
  if (kind === 'choice') return many ? 'many' : 'choice';
  if (kind === 'number' || kind === 'boolean' || kind === 'dice' || kind === 'text') return kind;
  return null;
}
