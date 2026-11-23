import { unknownWords, NO_NAME } from '../../ui/formula-resolve.ts';
import type { System, SlotRef } from '@vtt/schema';
import { compile, wordsOf } from '@vtt/engine';
import { t } from '../../i18n/author.ts';
import { dieWord } from './readback.ts';
import { asDice } from '../../words.ts';

export interface ParsedRoll {
  die?: SlotRef;
  bonus?: SlotRef | null;
  error?: string;
}

const HEAD = new RegExp(`^(\\d+)?\\s*[${wordsOf('ru').dieLetters}]\\s*(\\d+)\\s*(?:\\+\\s*(.+))?$`, 'iu');

export function notationOf(system: System, key: string): string {
  const dice = system.constants?.[key]?.dice ?? [];
  return dice.map(d => `${typeof d.count === 'number' ? d.count : 1}d${d.sides}`).join(' + ');
}

export function dieRef(count: number, sides: number, system: System, picked?: string | null): SlotRef {
  if (picked && notationOf(system, picked) === `${count}d${sides}`) return picked;
  const known = Object.entries(system.constants ?? {}).find(([, c]) =>
    c.kind === 'die' && c.dice?.length === 1
    && (c.dice[0]!.count ?? 1) === count && c.dice[0]!.sides === sides && !c.dice[0]!.name

    && (!c.read || c.read === 'sum'));
  return known ? known[0] : { expr: `"${count}d${sides}"` };
}

export const unquote = (text: string): string => text.trim().replace(/^(["'])(.*)\1$/su, '$2');

export type NameRef = (name: string) => SlotRef | null;

export function parseRollExpr(text: string, system: System, picked?: string | null): ParsedRoll {
  const source = text.trim();
  if (!source) return { die: undefined, bonus: null };

  const m = source.match(HEAD);
  if (!m) return { error: t('fields:rollExpr.start') };

  const count = Number(m[1] ?? 1);
  const sides = Number(m[2]);
  const die = dieRef(count, sides, system, picked);

  const rest = (m[3] ?? '').trim();
  return { die, bonus: rest ? { expr: rest } : null };
}

export function formatRollExpr(roll: unknown, system: System): string {
  const r = (roll ?? {}) as { die?: unknown; bonus?: unknown };
  let head = '';
  if (typeof r.die === 'string' && r.die) head = asDice(dieWord(system, r.die));
  else if (r.die && typeof r.die === 'object' && 'expr' in r.die) head = asDice(unquote(String((r.die as { expr: unknown }).expr)));
  let tail = '';
  if (r.bonus && typeof r.bonus === 'object') {
    const b = r.bonus as Record<string, unknown>;
    if ('expr' in b) tail = String(b.expr);
  }
  return [head, tail].filter(Boolean).join(' + ');
}

export function badFormula(bonus: unknown): string | null {
  if (!bonus || typeof bonus !== 'object' || !('expr' in (bonus as object))) return null;
  const text = String((bonus as { expr: unknown }).expr ?? '').trim();
  if (!text) return null;
  try { compile(text); return null; } catch (err) {
    const [unknown] = unknownWords(text, []);
    return unknown ? t('fields:rollExpr.pickName', { name: NO_NAME(unknown) }) : (err as Error).message;
  }
}

export function exprText(bonus: unknown): string {
  if (!bonus || typeof bonus !== 'object') return '';
  const b = bonus as Record<string, unknown>;
  if ('expr' in b) return String(b.expr ?? '');
  return '';
}
