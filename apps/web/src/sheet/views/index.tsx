import type { ReactNode } from 'react';
import type { ControlKind, FieldOption } from '@vtt/schema';
import { VIEW_KINDS, VIEW_LABELS, SHOWS_ONLY } from '@vtt/engine';
import { Signed, Big, Stepper, Slider, Pips, Charges, Bar } from './number.tsx';
import { Toggle, Ring, Choice, Chips, Die } from './pick.tsx';
import type { ViewProps } from './kit.ts';
import { t } from '../../i18n/index.ts';

export type { ViewProps } from './kit.ts';
export { viewsFor, familyOf, columnFamily, viewNeeds, takesBounds, TAKES_BOUNDS, TAKES_STEP } from '@vtt/engine';
export type { ValueFamily } from '@vtt/engine';

export interface ViewSpec {
  label: string;
  hint: string;
  shows: boolean;
  plays: boolean;
  fits: (value: unknown) => boolean;
  draw: (props: ViewProps) => ReactNode;
  sample: Omit<ViewProps, 'label'>;
}

const isNumber = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value);
const blankOr = (test: (value: unknown) => boolean) => (value: unknown): boolean =>
  value === null || value === undefined || value === '' || test(value);

const sampleSteps = (): FieldOption[] => [
  { value: 0, label: t('sheet:view.sample.none') },
  { value: 1, label: t('sheet:view.sample.weak') },
  { value: 2, label: t('sheet:view.sample.strong') },
];
const samplePicks = (): FieldOption[] => [
  { value: 'a', label: t('sheet:view.sample.one') },
  { value: 'b', label: t('sheet:view.sample.two') },
  { value: 'c', label: t('sheet:view.sample.three') },
];

const SPECS: Record<ControlKind, Pick<ViewSpec, 'fits' | 'draw'>> = {
  signed: { fits: blankOr(isNumber), draw: Signed },
  big: { fits: blankOr(isNumber), draw: Big },
  stepper: { fits: blankOr(isNumber), draw: Stepper },
  slider: { fits: blankOr(isNumber), draw: Slider },
  pips: { fits: blankOr(isNumber), draw: Pips },
  charges: { fits: blankOr(isNumber), draw: Charges },
  bar: { fits: blankOr(isNumber), draw: Bar },
  toggle: { fits: blankOr(value => typeof value === 'boolean'), draw: Toggle },
  ring: { fits: () => true, draw: Ring },
  choice: { fits: () => true, draw: Choice },
  chips: { fits: () => true, draw: Chips },
  die: { fits: blankOr(value => typeof value === 'string'), draw: Die },
};

const samples = (): Record<ControlKind, ViewSpec['sample']> => ({
  signed: { value: 3 },
  big: { value: 16 },
  stepper: { value: 12, min: 0, max: 30 },
  slider: { value: 3, min: 1, max: 9 },
  pips: { value: 3, max: 5 },
  charges: { value: 4, max: 6 },
  bar: { value: 27, max: 45 },
  toggle: { value: true },
  ring: { value: 1, options: sampleSteps() },
  choice: { value: 1, options: sampleSteps() },
  chips: { value: ['a', 'c'], options: samplePicks() },
  die: { value: t('sheet:view.sample.die') },
});

const PLAYS: readonly ControlKind[] = ['stepper', 'slider', 'pips', 'charges', 'bar', 'toggle', 'ring'];

const specOf = (kind: ControlKind): ViewSpec => ({
  get label() { return VIEW_LABELS[kind]; },
  get hint() { return t(`sheet:view.hint.${kind}`); },
  get sample() { return samples()[kind]; },
  shows: SHOWS_ONLY.includes(kind),
  plays: PLAYS.includes(kind),
  fits: SPECS[kind].fits,
  draw: SPECS[kind].draw,
});

export const VIEWS: Record<ControlKind, ViewSpec> = Object.fromEntries(VIEW_KINDS.map(kind => [kind, specOf(kind)])) as Record<ControlKind, ViewSpec>;

export const VIEW_KEYS = VIEW_KINDS;
