import { newPass } from './calc.ts';
import { resolveRoll } from './modifiers.ts';
import { dieConstant, rollLead, unfoldDice, withCount } from './lead-die.ts';
import type { LeadRoll } from './lead-die.ts';
import { packRef, resolveNumber, resolveOptionalNumber } from './refs.ts';
import { EngineError } from './errors.ts';
import type { System, Sheet, Compendium, Die, SlotRef } from '../model/types.ts';

export interface Check {
  die: { constant: string };
  count?: SlotRef;
  bonus?: SlotRef;
  tags?: string[];
}

export interface Checked {
  rolled: LeadRoll;
  bonus: number;
  total: number;
  edits: string[];
}

export function rollCheck(
  system: System, sheet: Sheet, check: Check,
  { compendium, die, owner }: { compendium?: Compendium | null; die: Die; owner: string },
): Checked {
  const pass = newPass(system, sheet, { compendium: compendium ?? undefined });
  const ctx = { pass, owner };
  const mods = resolveRoll(system, sheet, check.tags ?? [], pass);
  const constant = dieConstant(system, check.die.constant);
  const def = unfoldDice(withCount(constant, check.count, owner), (ref, what) => resolveNumber(packRef(ref, ctx), ctx, what));
  const rolled = rollLead(def, die, mods.edits);
  const bonus = (check.bonus ? resolveOptionalNumber(packRef(check.bonus, ctx), ctx, `${owner} · прибавка`) ?? 0 : 0) + mods.bonus;
  return { rolled, bonus, total: rolled.total + bonus, edits: mods.edits.map(edit => edit.label ?? '') };
}

export function fieldCheck(system: System, tag: string): Check & { label: string } {
  const field = system.fields.find(f => f.tag === tag);
  if (!field) throw new EngineError(`система не объявляет поля «${tag}»`);
  if (!field.roll) throw new EngineError(`по полю «${field.label}» не бросают — включите броски в конструкторе`);
  const constant = (field.roll as { die?: { constant?: string } }).die?.constant;
  if (!constant) throw new EngineError(`по полю «${field.label}» бросают, но кость не выбрана`);
  const { label, count, bonus, tags } = field.roll;
  return {
    label: label ?? field.label,
    die: { constant },
    ...(count ? { count } : {}),
    ...(bonus ? { bonus } : {}),
    ...(tags?.length ? { tags } : {}),
  };
}
