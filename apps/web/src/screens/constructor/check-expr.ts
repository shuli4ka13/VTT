import type { System, SlotRef } from '@vtt/schema';
import { asDice } from '../../words.ts';
import { tagWords } from '@vtt/engine/engine/roll-tags';
import { dieRef, unquote } from './roll-expr.ts';
import type { NameRef } from './roll-expr.ts';

export type RollTag = string | SlotRef;

export interface CheckRoll {
  die?: SlotRef;
  count?: SlotRef;
  bonus?: SlotRef | null;
  tags: RollTag[];
}

export interface ParsedCheck {
  roll: CheckRoll;
  successWhen: string;
  versus: unknown;
}

const OPS: readonly (readonly [string, string])[] = [
  ['>=', 'atLeast'], ['<=', 'notOver'], ['==', 'equals'], ['>', 'over'], ['<', 'under'], ['=', 'equals'],
];

const TEXT_OF: Record<string, string> = { atLeast: '>=', notOver: '<=', over: '>', under: '<', equals: '==' };

const ROLL = 'кинуть(';

function walk(text: string, from: number, visit: (i: number, ch: string, depth: number) => boolean): void {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (visit(i, ch, depth)) return;
  }
}

function closing(text: string, open: number): number {
  let at = -1;
  walk(text, open, (i, ch, depth) => { if (ch === ')' && depth === 0) { at = i; return true; } return false; });
  return at;
}

function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let start = 0;
  walk(text, 0, (i, ch, depth) => {
    if (depth === 0 && ch === sep) { out.push(text.slice(start, i)); start = i + 1; }
    return false;
  });
  out.push(text.slice(start));
  return out.map(part => part.trim());
}

export function comparison(text: string): { left: string; op: string; right: string } | null {
  let found: { left: string; op: string; right: string } | null = null;
  walk(text, 0, (i, ch, depth) => {
    if (depth !== 0 || !'<>='.includes(ch)) return false;
    if (ch === '=' && (text[i - 1] === '!' || text[i - 1] === '<' || text[i - 1] === '>')) return false;
    const sign = OPS.find(([one]) => text.startsWith(one, i));
    if (!sign) return false;
    found = { left: text.slice(0, i).trim(), op: sign[1], right: text.slice(i + sign[0].length).trim() };
    return true;
  });
  return found;
}

const bareName = (text: string): string | null => /^@([\p{L}\p{N}_.]+)$/u.exec(text.trim())?.[1] ?? null;

const tailRef = (rest: string): SlotRef => ({ expr: rest.trim() });

interface RollSide { roll: CheckRoll; error?: string }

function rollSide(text: string, system: System, asName?: NameRef): RollSide | null {
  const t = text.trim();
  if (!t.startsWith(ROLL)) return null;
  const end = closing(t, ROLL.length - 1);
  if (end < 0) return { roll: { tags: [] }, error: 'у «кинуть(» нет закрывающей скобки' };
  const [head = '', ...tagTexts] = splitTop(t.slice(ROLL.length, end), ',');
  const star = topStar(head);
  const dieText = star < 0 ? head : head.slice(0, star).trim();
  const count = star < 0 ? null : head.slice(star + 1).trim();
  if (count === '') return { roll: { tags: [] }, error: 'после «*» в «кинуть(…)» — сколько костей' };
  const rest = t.slice(end + 1).trim();

  let die: SlotRef | undefined;
  const dieName = bareName(dieText);
  if (dieName) {
    const key = dieName;
    if (!system.constants?.[key]) return { roll: { tags: [] }, error: `«${key}» — не кость системы` };
    die = key;
  } else {
    const m = /^(\d+)?\s*[dдк]\s*(\d+)$/iu.exec(dieText);
    if (!m) return { roll: { tags: [] }, error: 'первое в «кинуть(…)» — кость: «1к20» или кость системы через @' };
    const found = dieRef(Number(m[1] ?? 1), Number(m[2]), system);
    if (typeof found !== 'string') return { roll: { tags: [] }, error: `в системе нет кости ${asDice(`${m[1] ?? 1}d${m[2]}`)} — заведите её в «Правилах» или выберите через @` };
    die = found;
  }

  const words = tagWords(system);
  const tags: RollTag[] = [];
  for (const text of tagTexts.filter(Boolean)) {
    const name = bareName(text);
    const input = name && asName ? asName(name) : null;
    const tag = name && words.has(name) ? name : input && typeof input === 'object' ? { expr: `@${name}` } : !name && text.includes('"') ? tailRef(text) : null;
    if (!tag) {
      return { roll: { tags: [] }, error: `после кости в «кинуть(…)» — метки через @: строки таблиц или входы, а «${text}» не из них` };
    }
    tags.push(tag);
  }

  let bonus: SlotRef | null = null;
  if (rest) {
    if (!/^[+-]/.test(rest)) return { roll: { tags: [] }, error: `после «кинуть(…)» ждётся «+» или «−», а стоит «${rest}»` };
    const tail = rest.startsWith('+') ? rest.slice(1).trim() : rest;
    bonus = tailRef(tail);
  }
  return { roll: { die, ...(count ? { count: tailRef(count) } : {}), bonus, tags } };
}

function topStar(text: string): number {
  let at = -1;
  walk(text, 0, (i, ch, depth) => { if (depth === 0 && ch === '*') { at = i; return true; } return false; });
  return at;
}

export function parseCheck(text: string, system: System, asName?: NameRef): ParsedCheck | { error: string } {
  const cmp = comparison(text.trim());
  if (!cmp) return { error: 'проверка — это сравнение: «кинуть(…) + прибавка >= против»' };
  const mine = rollSide(cmp.left, system, asName);
  if (!mine) return { error: 'слева — бросок: начните с «кинуть(…)»' };
  if (mine.error) return { error: mine.error };
  if (!cmp.right) return { error: 'справа от сравнения пусто — с чем сравниваем?' };

  if (cmp.right.startsWith(ROLL)) return { error: 'встречный бросок — отдельный шаг «бросок» того, кто защищается; справа напишите его имя: @защита' };
  return { roll: mine.roll, successWhen: cmp.op, versus: tailRef(cmp.right) };
}

function refText(ref: unknown): string {
  if (!ref || typeof ref !== 'object') return ref === undefined || ref === null ? '' : String(ref);
  const r = ref as Record<string, unknown>;
  if ('expr' in r) return String(r.expr ?? '');
  return '';
}

function rollText(roll: CheckRoll | undefined): string {
  const die = roll?.die as unknown;
  const head = !die ? '' : typeof die === 'string'
    ? `@${die}`
    : asDice(unquote(String((die as { expr?: unknown }).expr ?? '')));
  const many = roll?.count ? ` * ${refText(roll.count)}` : '';
  const kind = (roll?.tags ?? []).map(tag => `, ${typeof tag === 'string' ? `@${tag}` : refText(tag)}`).join('');
  const tail = refText(roll?.bonus);
  return `${ROLL}${head}${many}${kind})${tail ? (tail.startsWith('-') ? ` ${tail}` : ` + ${tail}`) : ''}`;
}

export function formatCheck(roll: Record<string, unknown> | null, check: Record<string, unknown>): string {
  const left = roll ? rollText({ tags: [], ...roll } as unknown as CheckRoll) : refText(check.value);
  return `${left} ${TEXT_OF[String(check.successWhen ?? 'atLeast')] ?? '>='} ${refText(check.versus)}`.trim();
}

export function parseRoll(text: string, system: System, asName?: NameRef): { roll: CheckRoll } | { error: string } {
  const side = rollSide(text, system, asName);
  if (!side) return { error: 'бросок начинается с «кинуть(…)»: кинуть(@кость, @метка) + прибавка' };
  if (side.error) return { error: side.error };
  return { roll: side.roll };
}

export const formatRoll = (roll: Record<string, unknown>): string =>
  rollText({ tags: [], ...roll } as unknown as CheckRoll);
