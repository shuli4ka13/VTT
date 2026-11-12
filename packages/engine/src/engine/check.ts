import { EngineError } from './errors.ts';
import type { SlotRef, System } from '../model/types.ts';
import { fieldOf } from '../model/sheet-columns.ts';
import type { Thrown } from '../core/roll.ts';

export const ROLLED_NAME = 'выпало';
export const ROLL_NAME = 'бросок';
export const NUMBER_NAME = 'число';
export const THRESHOLD_NAME = 'порог';
export const SUCCESS_NAME = 'успех';
export const MARGIN_NAME = 'степени';

export interface FieldThrow {
  thrown: Thrown;
  bonus: number;
  total: number;
  threshold: number | null;
  degree: string | null;
  success: boolean | null;
  margin: number | null;
  number: number | null;
}

export type Degrees = { label: string; if: SlotRef }[] | { table: string; of?: 'margin' };

export function hasDegrees(degrees: Degrees | undefined): degrees is Degrees {
  return Array.isArray(degrees) ? degrees.length > 0 : Boolean(degrees?.table);
}

export interface Check {
  die: string;
  count?: SlotRef;
  bonus?: SlotRef;
  sides?: SlotRef;
  sides2?: SlotRef;
  keep?: SlotRef;
  degrees?: Degrees;
  success?: SlotRef;
  margin?: SlotRef;
  under?: true;
  tags?: string[];
  threshold?: SlotRef;
}

export function fieldCheck(system: System, tag: string, second?: string | null): Check & { label: string } {
  const field = fieldOf(system, tag);
  if (!field) throw new EngineError(`система не объявляет поля «${tag}»`);
  if (!field.roll) throw new EngineError(`по полю «${field.label}» не бросают — включите броски в конструкторе`);
  const constant = (field.roll as { die?: string }).die;
  if (!constant) throw new EngineError(`по полю «${field.label}» бросают, но кость не выбрана`);
  const { label, count, bonus, sides, keep, degrees, under, tags } = field.roll;
  const { success, margin } = field.roll as { success?: SlotRef; margin?: SlotRef };
  const threshold = (field.roll as { threshold?: SlotRef }).threshold;
  const pair = (field.roll as { pair?: boolean }).pair === true;
  const other = second === undefined || second === null ? null : fieldOf(system, second);
  if (second !== undefined && second !== null) {
    if (!pair) throw new EngineError(`по полю «${field.label}» бросают одно поле — второе указать нельзя`);
    const fits = other?.roll && other.roll.tags?.[0] === tags?.[0] && (other.roll as { pair?: boolean }).pair === true && Boolean(other.roll.sides) && Boolean(sides);
    if (!other || !fits) throw new EngineError(`поле «${other?.label ?? second}» не бросают вместе с «${field.label}» — оба должны стоять в одном броске «Правил»`);
  }
  const both = pair ? ` + ${other?.label ?? field.label}` : '';
  const joined = [...new Set([...(tags ?? []), ...(other?.roll?.tags ?? [])])];
  return {
    label: `${label ?? field.label}${both}`,
    die: constant,
    ...(count ? { count } : {}),
    ...(bonus ? { bonus } : {}),
    ...(sides ? { sides } : {}),
    ...(pair && sides ? { sides2: other?.roll?.sides ?? sides } : {}),
    ...(keep ? { keep } : {}),
    ...(hasDegrees(degrees) ? { degrees } : {}),
    ...(success ? { success } : {}),
    ...(margin ? { margin } : {}),
    ...(under ? { under } : {}),
    ...(joined.length ? { tags: joined } : {}),
    ...(threshold ? { threshold } : {}),
  };
}
