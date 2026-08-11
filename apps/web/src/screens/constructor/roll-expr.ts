// Строка броска: «1к20 + #бонус_атаки» одним полем.
//
// Парсер сам раскладывает её на структуру движка: голова — кость (если в
// словаре системы есть такая же — ссылаемся на константу, чтобы смена
// ведущей кости меняла все броски разом; иначе — литерал), хвост после
// «+» — число или формула. Автор видит одну строку, движок — структуру,
// преимущество — именованную кость, которую можно удвоить.

import type { System, SlotRef } from '@vtt/schema';
import { dieWord } from './readback.ts';

export interface ParsedRoll {
  die?: SlotRef;
  bonus?: SlotRef | null;
  error?: string;
}

const HEAD = /^(\d+)?\s*[dдк]\s*(\d+)\s*(?:\+\s*(.+))?$/iu;

export function parseRollExpr(text: string, system: System): ParsedRoll {
  const t = text.trim();
  if (!t) return { die: undefined, bonus: null };

  const m = t.match(HEAD);
  if (!m) return { error: 'бросок начинается с кости: «1к20» или «1к20 + #бонус»' };

  const count = Number(m[1] ?? 1);
  const sides = Number(m[2]);
  const known = Object.entries(system.constants ?? {}).find(([, c]) =>
    c.kind === 'die' && c.dice?.length === 1
    && (c.dice[0]!.count ?? 1) === count && c.dice[0]!.sides === sides && !c.dice[0]!.name);
  const die = (known ? { constant: known[0] } : { const: `${count}d${sides}` }) as SlotRef;

  const rest = (m[3] ?? '').trim();
  const bonus = !rest ? null
    : /^-?\d+(\.\d+)?$/.test(rest) ? { const: Number(rest) } as SlotRef
      : { expr: rest } as SlotRef;

  return { die, bonus };
}

export function formatRollExpr(roll: unknown, system: System): string {
  const r = (roll ?? {}) as { die?: unknown; bonus?: unknown };
  let head = '';
  if (r.die && typeof r.die === 'object') {
    if ('constant' in r.die) head = dieWord(system, String((r.die as { constant: unknown }).constant));
    else if ('const' in r.die) head = String((r.die as { const: unknown }).const).replace(/d/i, 'к');
  }
  let tail = '';
  if (r.bonus && typeof r.bonus === 'object') {
    const b = r.bonus as Record<string, unknown>;
    if ('expr' in b) tail = String(b.expr);
    else if ('const' in b) tail = String(b.const);
    else if ('param' in b) tail = `из записи: ${String(b.param)}`;
    else if ('ref' in b) tail = `результат «${String(b.ref)}»`;
  }
  return [head, tail].filter(Boolean).join(' + ');
}
