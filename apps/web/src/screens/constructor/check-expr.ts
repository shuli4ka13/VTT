import type { System, SlotRef } from '@vtt/schema';
import { ownerOf, RECEIVER, SENDER } from '@vtt/engine/engine/owners';
import { asDice } from '../../words.ts';
import { tagWords } from '@vtt/engine/engine/roll-tags';
import { dieRef } from './roll-expr.ts';
import type { NameRef } from './roll-expr.ts';

export type RollTag = string | SlotRef;

export interface CheckRoll {
  die?: SlotRef;
  bonus?: SlotRef | null;
  tags: RollTag[];
}

export interface ParsedCheck {
  roll: CheckRoll;
  side?: 'target';
  successWhen: string;
  versus: unknown;
}

const OPS: readonly (readonly [string, string])[] = [
  ['>=', 'atLeast'], ['<=', 'notOver'], ['==', 'equals'], ['>', 'over'], ['<', 'under'], ['=', 'equals'],
];

const TEXT_OF: Record<string, string> = { atLeast: '>=', notOver: '<=', over: '>', under: '<', equals: '==' };

const ROLL = 'кинуть(';

function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    if (text[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    if (text[i] === ')') depth--;
    if (depth === 0 && text[i] === sep) { out.push(text.slice(start, i)); start = i + 1; }
  }
  out.push(text.slice(start));
  return out.map(part => part.trim());
}

function comparison(text: string): { left: string; op: string; right: string } | null {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth !== 0 || !'<>='.includes(ch)) continue;
    if (ch === '=' && (text[i - 1] === '!' || text[i - 1] === '<' || text[i - 1] === '>')) continue;
    const found = OPS.find(([sign]) => text.startsWith(sign, i));
    if (!found) continue;
    return { left: text.slice(0, i).trim(), op: found[1], right: text.slice(i + found[0].length).trim() };
  }
  return null;
}

const bareName = (text: string): string | null => /^@([\p{L}\p{N}_.]+)$/u.exec(text.trim())?.[1] ?? null;

const tailRef = (rest: string): SlotRef => ({ expr: rest.trim() });

interface RollSide { roll: CheckRoll; owner: string | null; error?: string }

function rollSide(text: string, system: System, asName?: NameRef): RollSide | null {
  const t = text.trim();
  if (!t.startsWith(ROLL)) return null;
  const end = closing(t, ROLL.length - 1);
  if (end < 0) return { roll: { tags: [] }, owner: null, error: 'у «кинуть(» нет закрывающей скобки' };
  const [dieText = '', ...tagTexts] = splitTop(t.slice(ROLL.length, end), ',');
  const rest = t.slice(end + 1).trim();

  let owner: string | null = null;
  let die: SlotRef | undefined;
  const dieName = bareName(dieText);
  if (dieName) {
    const owned = ownerOf(dieName);
    owner = owned?.owner ?? null;
    const key = owned?.rest ?? dieName;
    if (!system.constants?.[key]) return { roll: { tags: [] }, owner, error: `«${key}» — не кость системы` };
    die = { constant: key } as SlotRef;
  } else {
    const m = /^(\d+)?\s*[dдк]\s*(\d+)$/iu.exec(dieText);
    if (!m) return { roll: { tags: [] }, owner, error: 'первое в «кинуть(…)» — кость: «1к20» или кость системы через @' };
    const found = dieRef(Number(m[1] ?? 1), Number(m[2]), system) as Record<string, unknown>;
    if (!('constant' in found)) return { roll: { tags: [] }, owner, error: `в системе нет кости ${asDice(`${m[1] ?? 1}d${m[2]}`)} — заведите её в «Правилах» или выберите через @` };
    die = found as SlotRef;
  }

  const words = tagWords(system);
  const tags: RollTag[] = [];
  for (const text of tagTexts.filter(Boolean)) {
    const name = bareName(text);
    const input = name && asName ? asName(name) : null;
    const tag = name && words.has(name) ? name : input && 'param' in (input as object) ? input : null;
    if (!tag) {
      return { roll: { tags: [] }, owner, error: `после кости в «кинуть(…)» — метки через @: строки таблиц или входы, а «${text}» не из них` };
    }
    tags.push(tag);
  }

  let bonus: SlotRef | null = null;
  if (rest) {
    if (!/^[+-]/.test(rest)) return { roll: { tags: [] }, owner, error: `после «кинуть(…)» ждётся «+» или «−», а стоит «${rest}»` };
    const tail = rest.startsWith('+') ? rest.slice(1).trim() : rest;
    bonus = tailRef(tail);
  }
  return { roll: { die, bonus, tags }, owner };
}

export function parseCheck(text: string, system: System, asName?: NameRef): ParsedCheck | { error: string } {
  const cmp = comparison(text.trim());
  if (!cmp) return { error: 'проверка — это сравнение: «кинуть(…) + прибавка >= против»' };
  const mine = rollSide(cmp.left, system, asName);
  if (!mine) return { error: 'слева — бросок: начните с «кинуть(…)»' };
  if (mine.error) return { error: mine.error };
  if (!cmp.right) return { error: 'справа от сравнения пусто — с чем сравниваем?' };

  const other = rollSide(cmp.right, system, asName);
  if (other?.error) return { error: other.error };
  const versus = other
    ? { roll: { die: other.roll.die, ...(other.roll.bonus ? { bonus: other.roll.bonus } : {}), ...(other.roll.tags.length ? { tags: other.roll.tags } : {}) } }
    : tailRef(cmp.right);

  return {
    roll: mine.roll,
    ...(mine.owner === RECEIVER ? { side: 'target' as const } : {}),
    successWhen: cmp.op,
    versus,
  };
}

function refText(ref: unknown): string {
  if (!ref || typeof ref !== 'object') return ref === undefined || ref === null ? '' : String(ref);
  const r = ref as Record<string, unknown>;
  if ('expr' in r) return String(r.expr ?? '');
  if ('const' in r) return String(r.const ?? '');
  for (const key of ['param', 'constant'] as const) {
    if (key in r) return `@${String(r[key])}`;
  }
  return '';
}

function rollText(roll: CheckRoll | undefined, owner: string | null): string {
  const die = roll?.die as Record<string, unknown> | undefined;
  const head = !die ? '' : 'constant' in die
    ? `@${owner ? `${owner}.` : ''}${String(die.constant)}`
    : asDice(String(die.const ?? ''));
  const kind = (roll?.tags ?? []).map(tag => `, ${typeof tag === 'string' ? `@${tag}` : refText(tag)}`).join('');
  const tail = refText(roll?.bonus);
  return `${ROLL}${head}${kind})${tail ? (tail.startsWith('-') ? ` ${tail}` : ` + ${tail}`) : ''}`;
}

export function formatCheck(step: Record<string, unknown>): string {
  const target = step.side === 'target';
  const left = rollText(step.roll as CheckRoll | undefined, target ? RECEIVER : null);
  const versus = step.versus as Record<string, unknown> | undefined;
  const right = versus && typeof versus === 'object' && 'roll' in versus
    ? rollText(versus.roll as CheckRoll, target ? SENDER : RECEIVER)
    : refText(versus);
  return `${left} ${TEXT_OF[String(step.successWhen ?? 'atLeast')] ?? '>='} ${right}`.trim();
}
