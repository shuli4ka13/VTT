import { live, tr } from './tongue.ts';

export const SUN_STAGES = live({
  cost: 'плата',
  target: 'цель',
  roll: 'бросок',
  check: 'проверка',
  amount: 'сколько',
  deliver: 'нанести',
  then: 'потом',
  when: 'когда',
  onlyIf: 'только если',
  decides: 'решает',
  does: 'делает',
  while: 'пока',
  lasts: 'длится',
} as const);

export const SUN_KINDS = live({
  step: 'шаг',
  heard: 'что случилось',
  input: 'вход',
  field: 'поле',
  result: 'результат',
  value: 'значение',
  call: 'вызов',
  cost: 'плата',
  state: 'состояние',
  tag: 'метка',
  seam: 'привязка',
  ask: 'спросить стол',
  stop: 'стоп',
  aside: 'вне стола',
} as const);

export const sunIf = (): string => tr`если`;
export const sunElse = (): string => tr`иначе`;
export const sunEach = (name: string): string => tr`для каждого: ${name}`;
export const sunAfter = (): string => tr`после`;
export const sunAsked = (name: string): string => tr`${name}?`;
export const sunDecides = (): string => tr`решает игрок`;
export const sunButton = (): string => tr`сам или кнопкой`;
export const sunAttach = (): string => tr`когда повесили`;
export const sunDetach = (): string => tr`когда сняли`;
export const sunOf = (field: string, sheet: string): string => tr`${field} · ${sheet}`;
export const sunPhase = (phase: string, what: string): string => tr`${phase}: ${what}`;
