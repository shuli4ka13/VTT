import { compile } from '../formula/index.ts';
import { calc, fieldsFor, newPass } from './calc.ts';
import type { PassOptions } from './calc.ts';
import type { Sheet, System } from '../model/types.ts';

export interface Breach { tag: string; text: string }

const said = (value: unknown): string => (typeof value === 'number' ? String(Math.round(value * 100) / 100) : String(value));

export function breaches(system: System, sheet: Sheet, options: PassOptions = {}): Breach[] {
  const pass = newPass(system, sheet, options);
  const out: Breach[] = [];
  for (const field of fieldsFor(system, 'sheet')) {
    if (field.value.kind !== 'formula' || (field.value.min === undefined && field.value.max === undefined)) continue;
    const bound = (edge: number | string | undefined): number | null => {
      if (edge === undefined) return null;
      const value = typeof edge === 'number' ? edge : compile(edge).evaluate(pass.resolve);
      return typeof value === 'number' ? value : null;
    };
    let value: unknown;
    let low: number | null;
    let high: number | null;
    try {
      value = calc(system, sheet, field.tag, pass);
      low = bound(field.value.min);
      high = bound(field.value.max);
    } catch { continue; }
    if (typeof value !== 'number') continue;
    if (high !== null && value > high) out.push({ tag: field.tag, text: `«${field.label}»: ${said(value)} — больше ${said(high)}` });
    if (low !== null && value < low) out.push({ tag: field.tag, text: `«${field.label}»: ${said(value)} — меньше ${said(low)}` });
  }
  return out;
}

export function newBreaches(system: System, before: Sheet, after: Sheet, options: PassOptions = {}): Breach[] {
  const was = new Set(breaches(system, before, options).map(one => one.text));
  return breaches(system, after, options).filter(one => !was.has(one.text));
}
