import { loopOf } from '@vtt/engine/engine/steps/each';
import { splitsTargets } from '@vtt/engine/engine/steps/index';
import { pickedRow } from './choice-rows.ts';
import { amountParamOf } from '@vtt/engine/model/lists';
import type { System, Effect, Step, SystemConstant } from '@vtt/schema';
import { labelOfTag, formulaAsLabels } from '../../ui/formula.tsx';
import { formulaWords } from '../../ui/formula-words.ts';
import { dice as diceText, asDice, DIE_LETTER } from '../../words.ts';
import { fieldOf, hasField } from '@vtt/engine/model/sheet-columns';

export type Segment = { text: string } | { hole: string };

const seg = (text: string): Segment => ({ text });
const hole = (label: string): Segment => ({ hole: label });

export function countWord(system: System, count: unknown): string {
  if (typeof count !== 'object' || count === null) return String(count ?? 1);
  const expr = String((count as { expr?: unknown }).expr ?? '').trim();
  if (!expr) return '…';
  const tag = /^@([\p{L}\p{N}_]+)$/u.exec(expr)?.[1];
  if (tag) return fieldOf(system, tag)?.label || tag;
  return formulaAsLabels(system, expr);
}

export function dieWord(system: System, name: string): string {
  const constant = system.constants?.[name];
  if (!constant) return name;

  const dice = (constant.dice ?? [])
    .map(d => diceText(countWord(system, d.count), d.sides)).join(' + ');
  return dice || (constant.label ?? name);
}

export function readingWord(system: System, name: string): string | null {
  const read = system.constants?.[name]?.read;
  if (!read || read === 'sum') return null;
  const kind = typeof read === 'string' ? read : read.kind;
  if (kind === 'sum') return null;
  if (kind === 'count') {
    const n = typeof read === 'object' ? read.atLeast : undefined;
    return typeof n === 'number' ? `успехи от ${n}` : 'счёт успехов';
  }
  if (kind === 'best') return 'лучшая';
  if (kind === 'worst') return 'худшая';
  return String(kind);
}

export type Names = Map<string, string>;

const SHEET_WORDS: Record<string, string> = { носитель: 'носитель', стол: 'стол' };

const sheetLabel = (effect: Effect, name: string): string | null => {
  const param = effect.params?.find(p => p.key === name && p.kind === 'sheet');
  if (param) return param.label ?? param.key;
  const loop = (effect.steps ?? []).find(step => splitsTargets(step)) as { of?: unknown } | undefined;
  const one = loop ? loopOf(effect.params, loop) : null;
  if (one?.key === name) return one.label.toLowerCase();
  return SHEET_WORDS[name] ?? null;
};

const onSheet = (effect: Effect, name: string): { sheet: string; rest: string } | null => {
  const dot = name.indexOf('.');
  if (dot <= 0) return null;
  const sheet = sheetLabel(effect, name.slice(0, dot));
  return sheet ? { sheet, rest: name.slice(dot + 1) } : null;
};

export const whoOf = (effect: Effect, ref: unknown): string => {
  const name = /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((ref as { expr?: unknown } | undefined)?.expr ?? ''))?.[1];
  return name ? `«${sheetLabel(effect, name) ?? name}»` : '⟨кто?⟩';
};

export function refSegment(ref: unknown, system: System, effect: Effect, emptyAs: string, names?: Names): Segment {
  if (ref === null || ref === undefined || ref === '') return hole(emptyAs);
  if (typeof ref === 'string') {
    if (system.constants?.[ref]) {
      const reading = readingWord(system, ref);
      return seg(reading ? `${dieWord(system, ref)} (${reading})` : dieWord(system, ref));
    }
    if (system.effects?.[ref]) return seg(`«${system.effects[ref]!.label ?? ref}»`);
    if (system.tables?.[ref]) return seg(`«${system.tables[ref]!.label ?? ref}»`);
    return seg(ref);
  }
  if (typeof ref !== 'object') return seg(String(ref));
  const r = ref as Record<string, unknown>;
  if ('expr' in r) {
    const text = String(r.expr ?? '').trim();
    if (!text) return hole(emptyAs);
    const literal = /^(["'])(.*)\1$/su.exec(text);
    if (literal) return seg(asDice(literal[2]!));
    const alone = /^@([\p{L}\p{N}_.]+)$/u.exec(text)?.[1];
    if (alone) {
      const head = alone.split('.')[0]!;
      const sheet = onSheet(effect, alone);
      const declared = effect.params?.find(p => p.key === alone);
      if (declared) return hole(`вход «${declared.label ?? alone}»`);
      if (sheet && hasField(system, sheet.rest)) return seg(`«${labelOfTag(system, sheet.rest)}» (${sheet.sheet})`);
      if (hasField(system, alone)) return seg(`«${labelOfTag(system, alone)}»`);
      if (!sheet) {
        const named = names?.get(alone) ?? names?.get(head);
        return seg(named ? `«${named}»` : `результат «${head}»`);
      }
    }
    return seg(formulaWords(system, text, names));
  }
  return hole(emptyAs);
}


export function checkReadback(step: Step, roll: Step | null, system: System, effect: Effect, names?: Names): Segment[] {
  const s = step as any;
  const tail = '.';
  if (!roll) {
    return [refSegment(s.value, system, effect, 'что проверяем?', names), seg('с'), refSegment(s.versus, system, effect, 'с чем?', names), seg(tail)];
  }
  const r = roll as any;
  const out: Segment[] = [seg(`${whoOf(effect, r.by)} бросает`)];
  out.push(r.die ? refSegment(r.die, system, effect, 'какой костью?', names) : hole('какой костью?'));
  const tags = (r.tags ?? []) as unknown[];
  if (tags.length) {
    const plain = tags.map(tag => (typeof tag === 'string' ? tag : null));
    if (plain.every(Boolean)) out.push(seg(`(${plain.join(', ')})`));
    else tags.forEach(tag => out.push(typeof tag === 'string' ? seg(tag) : refSegment(tag, system, effect, 'метка?', names)));
  }
  if (r.bonus !== undefined && r.bonus !== null) {
    const bonus = refSegment(r.bonus, system, effect, 'прибавка?', names);
    if (!('text' in bonus) || (bonus.text !== '0' && bonus.text !== '')) out.push(seg('+'), bonus);
  }
  out.push(seg('— с'), refSegment(s.versus, system, effect, 'с чем сравнить?', names), seg(tail));
  return out;
}

export function amountValueSegments(step: Step, system: System, effect: Effect, names?: Names): Segment[] {
  const s = step as any;
  const out: Segment[] = [];
  if (s.field) {
    out.push(seg('бросок поля'), refSegment(s.field, system, effect, 'какое поле?', names));
    if (s.shift) out.push(seg('с поправкой'), refSegment(s.shift, system, effect, '', names));
    return out;
  }
  if (s.die) out.push(refSegment(s.die, system, effect, 'какие кости?', names));
  if (s.fixed) {
    if (out.length) out.push(seg('+'));
    out.push(refSegment(s.fixed, system, effect, 'сколько?', names));
  }
  if (!out.length) out.push(hole('сколько?'));
  if (s.bonus !== undefined && s.bonus !== null) {
    const bonus = refSegment(s.bonus, system, effect, '', names);
    if (!('text' in bonus) || (bonus.text !== '0' && bonus.text !== '')) out.push(seg('+'), bonus);
  }
  return out;
}

function exprSegments(expr: string, amount: Step | null, system: System, effect: Effect, names?: Names): Segment[] {
  const id = String((amount as any)?.id ?? '');
  const out: Segment[] = [];
  let rest = expr.trim();
  if (!rest) return [hole('чем станет?')];
  for (;;) {
    const m = rest.match(/[@#]([\p{L}\p{N}_.]+)/u);
    if (!m || m.index === undefined) break;
    const before = rest.slice(0, m.index).trim();
    if (before) out.push(seg(before));
    if (id && m[1] === id && amount) {
      const inner = amountValueSegments(amount, system, effect, names);
      out.push(seg('('), ...inner, seg(')'));
    } else {
      const name = m[1]!;
      const sheet = onSheet(effect, name);
      const field = sheet?.rest ?? name;
      const label = names?.get(name)
        ?? (hasField(system, field) ? `${labelOfTag(system, field)}${sheet ? ` (${sheet.sheet})` : ''}` : null);
      out.push(label ? seg(`«${label}»`) : hole(`${name} — такого нет`));
    }
    rest = rest.slice(m.index + m[0].length);
  }
  const tail = rest.trim();
  if (tail) out.push(seg(tail));
  return out;
}

export function changeReadback(step: Step, amount: Step | null, system: System, effect: Effect, names?: Names): Segment[] {
  if (step.type === 'emit') return sendReadback(step, system, effect);
  const s = step as any;
  if (step.type === 'status') {
    const ref = s.effect;
    let what: Segment;
    if (typeof ref === 'string') {
      const id = ref;
      const known = id ? system.effects?.[id] : undefined;
      what = known ? seg(`«${known.label ?? id}».`) : hole(`«${id || '?'}» — в системе нет`);
    } else what = refSegment(ref, system, effect, 'какое состояние?', names);
    if ((s.mode ?? 'apply') === 'remove' && s.by === 'tag') {
      return [seg(`С ${whoOf(effect, s.to)} снимаются все эффекты с меткой`), typeof ref === 'string' && ref ? seg(`«${ref}».`) : hole('какая метка?')];
    }
    return (s.mode ?? 'apply') === 'remove'
      ? [seg(`С ${whoOf(effect, s.to)} снимается состояние`), what]
      : [seg(`На ${whoOf(effect, s.to)} вешается состояние`), what];
  }
  const field = refSegment(s.target, system, effect, 'какое поле?', names);

  const expr = s.value && typeof s.value === 'object' && 'expr' in s.value
    ? String(s.value.expr ?? '') : null;
  const whole = amount && expr !== null && expr.trim() === `@${String((amount as { id?: unknown }).id ?? '')}`;
  const lone = expr !== null && /^\s*@[\p{L}\p{N}_.]+\s*$/u.test(expr);
  const what = expr !== null && !whole && !lone
    ? exprSegments(expr, amount, system, effect, names)
    : amount && (whole || expr === null)
      ? amountValueSegments(amount, system, effect, names)
      : [refSegment(s.value, system, effect, 'сколько?', names)];
  const direction = s.direction ?? 'subtract';
  if (direction === 'set') return [field, seg('становится'), ...what, seg('.')];
  if (direction === 'add') return [field, seg('растёт на'), ...what, seg('.')];
  return [field, seg('уменьшается на'), ...what, seg('.')];
}

export function sendReadback(step: Step, system: System, effect: Effect, names?: Names): Segment[] {
  const s = step as Record<string, unknown>;
  const fromInput = typeof s.effect === 'object' && s.effect ? /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((s.effect as { expr?: unknown }).expr ?? ''))?.[1] : undefined;
  const via = fromInput ? effect.params?.find(p => p.key === fromInput) : undefined;
  const id = typeof s.effect === 'string' ? s.effect : '';
  const event = system.effects?.[id];
  const args = (s.args ?? {}) as Record<string, unknown>;
  const main = amountParamOf(event);
  const sent = main ? args[main.key] : undefined;
  if (fromInput) return [seg(`Зовёт то, что передали во вход «${via?.label ?? fromInput}»${typeof via?.default === 'string' ? ` (по умолчанию «${system.effects?.[via.default]?.label ?? via.default}»)` : ''}.`)];
  const name = id ? seg(`«${event?.label || id}»${main ? ':' : ''}`) : hole('какой эффект зовём?');
  const amount = !main ? [] : [sent === undefined ? hole('сколько?') : refSegment(sent, system, effect, 'сколько?', names)];
  const word = (t: unknown): string => {
    if (typeof t === 'string') return t;
    const text = String(((t ?? {}) as Record<string, unknown>).expr ?? '').trim();
    const literal = /^(["'])(.*)\1$/su.exec(text);
    if (literal) return literal[2]!;
    const input = /^@([\p{L}\p{N}_]+)$/u.exec(text)?.[1];
    const param = input ? effect.params?.find(p => p.key === input) : undefined;
    return param ? String(param.label ?? param.key) : '…';
  };
  const chosen = (event?.params ?? []).filter(p => p.kind === 'choice' && args[p.key] !== undefined).map(p => word(args[p.key]));
  const tags = chosen.filter(Boolean);
  if (event) {
    const given = (event.params ?? []).filter(p => args[p.key] !== undefined);
    if (!given.length) return [seg('ничего не передаётся.')];
    return given.flatMap((p, i) => [
      seg(`${i ? '; ' : ''}${p.label ?? p.key}:`),
      p.kind === 'sheet' ? seg(whoOf(effect, args[p.key]))
        : pickedRow(system, p, args[p.key]) ? seg(`«${pickedRow(system, p, args[p.key])!.label}»`)
          : refSegment(args[p.key], system, effect, '…', names),
    ]).concat(seg('.'));
  }
  return [
    seg('Зовёт'), name, ...amount,
    ...(tags.length ? [seg(`[${tags.join(', ')}]`)] : []),
    seg('.'),
  ];
}

export function numberReadback(step: Step, system: System, effect: Effect, names?: Names): Segment[] {
  const by = (step as { by?: unknown }).by;
  return [seg(by ? `${whoOf(effect, by)} бросает:` : 'Считается число:'), ...amountValueSegments(step, system, effect, names), seg('.')];
}

const plural = (n: number, one: string, few: string, many: string) => {
  const t = Math.abs(n) % 100;
  const d = t % 10;
  if (t > 10 && t < 20) return many;
  if (d === 1) return one;
  if (d >= 2 && d <= 4) return few;
  return many;
};

function partLabel(system: System, part: string): string {
  for (const constant of Object.values(system.constants ?? {})) {
    const term = (constant.dice ?? []).find(d => d.name === part);
    if (term) return term.label || part;
  }
  return part;
}

function opPhrase(op: Record<string, unknown>, system: System): string {
  const n = Number(op.n ?? 1);
  const by = Number(op.by ?? 0);

  const only = op.part ? ` (${partLabel(system, String(op.part))})` : '';
  switch (op.op) {
    case 'addDie':
      return (n === 1 ? 'кинуть на кость больше'
        : `кинуть на ${n} ${plural(n, 'кость', 'кости', 'костей')} больше`) + only;
    case 'wild':
      return 'один кубик — дикий: 5–6 дают три успеха, 1 гасит пятёрки';
    case 'keepBest':
      return (n === 1 ? 'оставить лучшую' : `оставить ${n} лучших`) + only;
    case 'keepWorst':
      return (n === 1 ? 'оставить худшую' : `оставить ${n} худших`) + only;
    case 'dieStep':
      return (by >= 0
        ? `взять кость на ${by} ${plural(by, 'ступень', 'ступени', 'ступеней')} выше`
        : `взять кость на ${-by} ${plural(by, 'ступень', 'ступени', 'ступеней')} ниже`) + only;
    case 'shiftVersus':

      return by <= 0 ? `сделать порог легче на ${-by}` : `сделать порог труднее на ${by}`;
    case 'shiftDegree':
      return by >= 0
        ? `сдвинуть степень успеха на ${by} вверх`
        : `сдвинуть степень успеха на ${-by} вниз`;
    case 'explode':
      return String(op.at ?? 'max') === 'min'
        ? `на единице кинуть ещё раз и вычесть${only}`
        : `на максимуме кинуть ещё раз и прибавить${only}`;
    case 'reroll':
      return (n === 1
        ? 'перебросить единицы, новый результат обязателен'
        : `перебросить кости не выше ${n}, новый результат обязателен`) + only;
    case 'flip':
      return String(op.prefer ?? 'low') === 'high'
        ? `перевернуть цифры, если так больше${only}`
        : `перевернуть цифры, если так меньше${only}`;
    case 'floorDie':
      return `считать кость не меньше ${Number(op.least ?? 10)}${only}`;
    case 'plus': {
      const said = plusWords(op, system);
      return said.startsWith('−') ? `вычесть ${said.slice(1)}` : `прибавить ${said}`;
    }
    default:
      return String(op.op);
  }
}

function plusWords(op: Record<string, unknown>, system: System): string {
  const expr = String((op.value as { expr?: unknown } | undefined)?.expr ?? '').trim();
  return expr ? formulaWords(system, expr) : '…';
}

const LADDER = [4, 6, 8, 10, 12, 20];

const written = (count: number, sides: number): string => `${count > 1 ? count : ''}${DIE_LETTER}${sides}`;

function simpleDie(system: System): { count: number; sides: number } | null {
  const dice = Object.values(system.constants ?? {}).filter(c => c.kind === 'die');
  if (dice.length !== 1) return null;
  const terms = dice[0]!.dice ?? [];
  const read = dice[0]!.read;
  const kind = typeof read === 'string' ? read : read?.kind ?? 'sum';
  const term = terms[0];
  if (terms.length !== 1 || !term || kind !== 'sum' || term.name || term.bonus || term.minus) return null;
  if (term.count !== undefined && typeof term.count !== 'number') return null;
  return { count: term.count ?? 1, sides: term.sides };
}

export function editNotation(edit: { ops?: Record<string, unknown>[] }, system: System): string | null {
  const base = simpleDie(system);
  const ops = edit.ops ?? [];
  if (!base || !ops.length) return null;
  let { count, sides } = base;
  const more: string[] = [];
  const tail: string[] = [];
  const words: string[] = [];
  for (const op of ops) {
    const n = Number(op.n ?? 1);
    const by = Number(op.by ?? 0);
    switch (op.op) {
      case 'addDie': {
        if (op.count !== undefined && typeof op.count !== 'number') return null;
        const k = Number(op.count ?? 1);
        if (op.sides !== undefined && Number(op.sides) !== sides) more.push(` + ${written(k, Number(op.sides))}`);
        else count += k;
        break;
      }
      case 'wild': tail.push('дикий кубик'); break;
      case 'keepBest': tail.push(n === 1 ? 'лучшая' : `${n} лучших`); break;
      case 'keepWorst': tail.push(n === 1 ? 'худшая' : `${n} худших`); break;
      case 'dieStep': {
        const at = LADDER.indexOf(sides);
        if (at >= 0) sides = LADDER[Math.min(LADDER.length - 1, Math.max(0, at + by))]!;
        break;
      }
      case 'floorDie': tail.push(`не меньше ${Number(op.least ?? 10)}`); break;
      case 'reroll': tail.push(n === 1 ? 'единицы перебросить' : `не выше ${n} перебросить`); break;
      case 'explode': tail.push(op.apart ? 'подрыв на максимуме' : String(op.at ?? 'max') === 'min' ? 'взрыв на единице' : 'взрыв на максимуме'); break;
      case 'flip': tail.push(String(op.prefer ?? 'low') === 'high' ? 'переворот в большую' : 'переворот в меньшую'); break;
      case 'plus': {
        const said = plusWords(op, system);
        more.push(said.startsWith('−') ? ` − ${said.slice(1)}` : ` + ${said}`);
        break;
      }
      case 'shiftVersus': words.push(by <= 0 ? `порог легче на ${-by}` : `порог труднее на ${by}`); break;
      case 'shiftDegree': words.push(by >= 0 ? `степень успеха на ${by} выше` : `степень успеха на ${-by} ниже`); break;
      default: return null;
    }
  }
  const dice = count !== base.count || sides !== base.sides || more.length || tail.length
    ? `${written(base.count, base.sides)} → ${written(count, sides)}${more.join('')}${tail.length ? `, ${tail.join(', ')}` : ''}`
    : '';
  return [dice, ...words].filter(Boolean).join('; ') || null;
}

export function editReadback(
  edit: { ops?: Record<string, unknown>[]; cancels?: string[] },
  system: System,
): Segment[] {
  const ops = edit.ops ?? [];
  if (!ops.length) return [hole('что она делает с броском?')];

  const phrases = ops.map(op => opPhrase(op, system));
  const head = phrases[0]!;
  const text = head.charAt(0).toUpperCase() + head.slice(1)
    + (phrases.length > 1 ? ', ' + phrases.slice(1).join(', ') : '');
  const out: Segment[] = [seg(text + '.')];

  if (edit.cancels?.length) {
    out.push(seg(`Гасится: ${edit.cancels.map(key => system.roll_edits?.[key]?.label || key).join(', ')}.`));
  }
  return out;
}

export function dieReadback(constant: SystemConstant, system: System): Segment[] {

  const dice = (constant.dice ?? []).map(d => {
    const head = typeof d.count === 'object' && d.count !== null
      ? `${DIE_LETTER}${d.sides} по числу «${countWord(system, d.count)}»`
      : diceText(d.count, d.sides);

    return d.name ? `${head} (${d.label || d.name})` : head;
  }).join(' + ');
  if (!dice) return [hole('из чего состоит бросок?')];

  const read = constant.read;
  const kind = typeof read === 'string' ? read : read?.kind ?? 'sum';
  const atLeast = typeof read === 'object' ? read.atLeast : undefined;

  const single = (constant.dice ?? []).length === 1
    && ((constant.dice ?? [])[0]!.count ?? 1) === 1;
  if (single && kind === 'sum') return [seg(`Кинуть ${dice}.`)];

  const tail = kind === 'best' ? 'взять лучшую'
    : kind === 'worst' ? 'взять худшую'
      : kind === 'count'
        ? `посчитать, сколько выпало не ниже ${atLeast ?? '?'}`
        : 'сложить';
  return [seg(`Кинуть ${dice} и ${tail}.`)];
}

export const joinReadback = (segments: Segment[]): string =>
  segments.map(part => ('text' in part ? part.text : `⟨${part.hole}⟩`))
    .join(' ')
    .replace(/\s+([.,])/g, '$1')
    .replace(/\.\s*\./g, '.');

export function seenReadback(step: Step, system: System): Segment[] {
  const read = step as unknown as Record<string, unknown>;
  const words = (ref: unknown): string => {
    const expr = String((ref as { expr?: unknown } | undefined)?.expr ?? '').trim();
    return expr ? formulaWords(system, expr) : '…';
  };
  if (step.type === 'roll-reroll') {
    return [{ text: read.which === 'lowest' ? 'одну меньшую кость' : `кости не выше ${words(read.upTo)}` }];
  }
  if (step.type === 'roll-add') {
    const keep = read.keep === 'best' ? ', оставить лучшую' : read.keep === 'worst' ? ', оставить худшую' : '';
    return [{ text: `${words(read.count)}${read.sides ? ` ${DIE_LETTER}${words(read.sides)}` : ''}${keep}` }];
  }
  if (step.type === 'roll-plus') return [{ text: `+ ${words(read.value)}` }];
  if (step.type === 'roll-bump') return [{ text: `кость +${words(read.value)}` }];
  return [];
}
