import { EngineError } from './errors.ts';
import type { SlotRef, System } from '../model/types.ts';
import { fieldOf } from '../model/sheet-columns.ts';

export interface Check {
  die: string;
  count?: SlotRef;
  bonus?: SlotRef;
  sides?: SlotRef;
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
  const { label, count, bonus, sides, under, tags } = field.roll;
  const threshold = (field.roll as { threshold?: SlotRef }).threshold;
  return {
    label: label ?? field.label,
    die: constant,
    ...(count ? { count } : {}),
    ...(bonus ? { bonus } : {}),
    ...(sides ? { sides } : {}),
    ...(under ? { under } : {}),
    ...(tags?.length ? { tags } : {}),
    ...(threshold ? { threshold } : {}),
  };
}
