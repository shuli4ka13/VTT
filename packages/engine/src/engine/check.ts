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
  keep?: SlotRef;
  degrees?: Degrees;
  success?: SlotRef;
  margin?: SlotRef;
  under?: true;
  tags?: string[];
  threshold?: SlotRef;
}

export function fieldCheck(system: System, tag: string): Check & { label: string } {
  const field = fieldOf(system, tag);
  if (!field) throw new EngineError(`система не объявляет поля «${tag}»`);
  if (!field.roll) throw new EngineError(`по полю «${field.label}» не бросают — включите броски в конструкторе`);
  const constant = (field.roll as { die?: string }).die;
  if (!constant) throw new EngineError(`по полю «${field.label}» бросают, но кость не выбрана`);
  const { label, count, bonus, sides, keep, degrees, under, tags } = field.roll;
  const { success, margin } = field.roll as { success?: SlotRef; margin?: SlotRef };
  const threshold = (field.roll as { threshold?: SlotRef }).threshold;
  return {
    label: label ?? field.label,
    die: constant,
    ...(count ? { count } : {}),
    ...(bonus ? { bonus } : {}),
    ...(sides ? { sides } : {}),
    ...(keep ? { keep } : {}),
    ...(hasDegrees(degrees) ? { degrees } : {}),
    ...(success ? { success } : {}),
    ...(margin ? { margin } : {}),
    ...(under ? { under } : {}),
    ...(tags?.length ? { tags } : {}),
    ...(threshold ? { threshold } : {}),
  };
}
