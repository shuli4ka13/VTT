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

/** Нотация кости словаря одной строкой: «2d6», «1d20». */
export function notationOf(system: System, key: string): string {
  const dice = system.constants?.[key]?.dice ?? [];
  return dice.map(d => `${typeof d.count === 'number' ? d.count : 1}d${d.sides}`).join(' + ');
}

/**
 * Чем стала набранная кость: ссылкой на словарь или литералом.
 *
 * `picked` — кость, которую человек ВЫБРАЛ в подсказке. Выбор весомее
 * совпадения нотации: у кости бывает своё чтение («считать успехи»), и
 * узнать его по «5d10» нельзя — а потерять, свалившись в литерал, легко.
 * Выбор действует, пока в строке стоит его нотация; переписал руками —
 * разбор снова идёт по совпадению.
 */
function dieRef(count: number, sides: number, system: System, picked?: string | null): SlotRef {
  if (picked && notationOf(system, picked) === `${count}d${sides}`) return { constant: picked } as SlotRef;
  const known = Object.entries(system.constants ?? {}).find(([, c]) =>
    c.kind === 'die' && c.dice?.length === 1
    && (c.dice[0]!.count ?? 1) === count && c.dice[0]!.sides === sides && !c.dice[0]!.name
    // Кость с чтением, отличным от суммы, — не то же самое, что «2d6»:
    // связать их молча значило бы подменить сумму счётом успехов.
    && (!c.read || c.read === 'sum'));
  return (known ? { constant: known[0] } : { const: `${count}d${sides}` }) as SlotRef;
}

export function parseRollExpr(text: string, system: System, picked?: string | null): ParsedRoll {
  const t = text.trim();
  if (!t) return { die: undefined, bonus: null };

  const m = t.match(HEAD);
  if (!m) return { error: 'бросок начинается с кости: «1к20» или «1к20 + #бонус»' };

  const count = Number(m[1] ?? 1);
  const sides = Number(m[2]);
  const die = dieRef(count, sides, system, picked);

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
    else if ('const' in r.die) head = String((r.die as { const: unknown }).const);
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

/**
 * То же для величины изменения: «1d8 + #мод_силы», но кость НЕОБЯЗАТЕЛЬНА —
 * лечение бывает и просто числом, и просто формулой. Голова строки, если
 * она похожа на кость, уезжает в слот костей (её бросает отправитель),
 * остальное — в прибавку, которую считают формулой.
 *
 * Зачем делить, раз человек пишет одной строкой: бросок и формула живут
 * в движке по-разному — кости бросаются при упаковке у отправителя, а
 * формула считается листом той стороны, которой она адресована.
 */
export function parseAmountExpr(text: string, system: System, picked?: string | null): ParsedRoll {
  const t = text.trim();
  if (!t) return { die: undefined, bonus: null };
  if (HEAD.test(t)) return parseRollExpr(t, system, picked);

  // Кости нет — вся строка это величина: число числом, прочее формулой.
  const bonus = /^-?\d+(\.\d+)?$/.test(t)
    ? { const: Number(t) } as SlotRef
    : { expr: t } as SlotRef;
  return { die: undefined, bonus };
}

/** Строка величины: кость и прибавка вместе, как их набирают. */
export function formatAmountExpr(amount: unknown, system: System): string {
  const a = (amount ?? {}) as { dice?: unknown; bonus?: unknown };
  return formatRollExpr({ die: a.dice, bonus: a.bonus }, system);
}
