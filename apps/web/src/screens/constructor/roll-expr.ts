import type { System, SlotRef } from '@vtt/schema';
import { dieWord } from './readback.ts';

export interface ParsedRoll {
  die?: SlotRef;
  bonus?: SlotRef | null;
  error?: string;
}

const HEAD = /^(\d+)?\s*[dдк]\s*(\d+)\s*(?:\+\s*(.+))?$/iu;

export function notationOf(system: System, key: string): string {
  const dice = system.constants?.[key]?.dice ?? [];
  return dice.map(d => `${typeof d.count === 'number' ? d.count : 1}d${d.sides}`).join(' + ');
}

function dieRef(count: number, sides: number, system: System, picked?: string | null): SlotRef {
  if (picked && notationOf(system, picked) === `${count}d${sides}`) return { constant: picked } as SlotRef;
  const known = Object.entries(system.constants ?? {}).find(([, c]) =>
    c.kind === 'die' && c.dice?.length === 1
    && (c.dice[0]!.count ?? 1) === count && c.dice[0]!.sides === sides && !c.dice[0]!.name

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

export function parseAmountExpr(text: string, system: System, picked?: string | null): ParsedRoll {
  const t = text.trim();
  if (!t) return { die: undefined, bonus: null };
  if (HEAD.test(t)) return parseRollExpr(t, system, picked);

  const bonus = /^-?\d+(\.\d+)?$/.test(t)
    ? { const: Number(t) } as SlotRef
    : { expr: t } as SlotRef;
  return { die: undefined, bonus };
}

export function formatAmountExpr(amount: unknown, system: System): string {
  const a = (amount ?? {}) as { dice?: unknown; bonus?: unknown };
  return formatRollExpr({ die: a.dice, bonus: a.bonus }, system);
}
