import type { ReactNode } from 'react';
import type { ControlKind, FieldOption } from '@vtt/schema';
import { VIEW_KINDS, VIEW_LABELS, SHOWS_ONLY } from '@vtt/engine/model/views';
import { Signed, Big, Stepper, Slider, Pips, Charges, Bar } from './number.tsx';
import { Toggle, Ring, Choice, Chips, Die } from './pick.tsx';
import type { ViewProps } from './kit.ts';

export type { ViewProps } from './kit.ts';
export { viewsFor, familyOf, columnFamily, viewNeeds, takesBounds, TAKES_BOUNDS, TAKES_STEP } from '@vtt/engine/model/views';
export type { ValueFamily } from '@vtt/engine/model/views';

export interface ViewSpec {
  label: string;
  hint: string;
  shows: boolean;
  fits: (value: unknown) => boolean;
  draw: (props: ViewProps) => ReactNode;
  sample: Omit<ViewProps, 'label'>;
}

const isNumber = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value);
const blankOr = (test: (value: unknown) => boolean) => (value: unknown): boolean =>
  value === null || value === undefined || value === '' || test(value);

const SAMPLE_STEPS: FieldOption[] = [{ value: 0, label: 'нет' }, { value: 1, label: 'слабо' }, { value: 2, label: 'сильно' }];
const SAMPLE_PICKS: FieldOption[] = [{ value: 'a', label: 'один' }, { value: 'b', label: 'два' }, { value: 'c', label: 'три' }];

const SPECS: Record<ControlKind, Omit<ViewSpec, 'label' | 'shows'>> = {
  signed: { hint: 'число со знаком: +3, −1', fits: blankOr(isNumber), draw: Signed, sample: { value: 3 } },
  big: { hint: 'главное число крупно', fits: blankOr(isNumber), draw: Big, sample: { value: 16 } },
  stepper: { hint: 'точный счёт кнопками', fits: blankOr(isNumber), draw: Stepper, sample: { value: 12, min: 0, max: 30 } },
  slider: { hint: 'плавный выбор от низа до верха', fits: blankOr(isNumber), draw: Slider, sample: { value: 3, min: 1, max: 9 } },
  pips: { hint: 'сколько отмечено из верха', fits: blankOr(isNumber), draw: Pips, sample: { value: 3, max: 5 } },
  charges: { hint: 'запас по кругу', fits: blankOr(isNumber), draw: Charges, sample: { value: 4, max: 6 } },
  bar: { hint: 'запас полосой, цвет по остатку', fits: blankOr(isNumber), draw: Bar, sample: { value: 27, max: 45 } },
  toggle: { hint: 'да или нет', fits: blankOr(value => typeof value === 'boolean'), draw: Toggle, sample: { value: true } },
  ring: { hint: 'ступени по кругу: варианты, да/нет или числа', fits: () => true, draw: Ring, sample: { value: 1, options: SAMPLE_STEPS } },
  choice: { hint: 'одна ступень кнопками', fits: () => true, draw: Choice, sample: { value: 1, options: SAMPLE_STEPS } },
  chips: { hint: 'несколько вариантов сразу', fits: () => true, draw: Chips, sample: { value: ['a', 'c'], options: SAMPLE_PICKS } },
  die: { hint: 'кость записью', fits: blankOr(value => typeof value === 'string'), draw: Die, sample: { value: '1к8' } },
};

export const VIEWS: Record<ControlKind, ViewSpec> = Object.fromEntries(VIEW_KINDS.map(kind => [kind, {
  ...SPECS[kind], label: VIEW_LABELS[kind], shows: SHOWS_ONLY.includes(kind),
}])) as Record<ControlKind, ViewSpec>;

export const VIEW_KEYS = VIEW_KINDS;
