import { loopOf, splitsTargets, amountParamOf, askWhom, fieldOf, hasField, HOLDER, DESK_ID, NAME_LABELS, stepSaid } from '@vtt/engine';
import { pickedRow } from './choice-rows.ts';
import type { System, Effect, Step, SystemConstant } from '@vtt/schema';
import { labelOfTag, formulaAsLabels } from '../../ui/formula.tsx';
import { formulaWords } from '../../ui/formula-words.ts';
import { shownFormula } from '../../ui/formula-lang.ts';
import { t } from '../../i18n/author.ts';
import { diceSaid as diceText, asDice, dieLetter } from '../../words.ts';
import { tagsSaid, tagSaid } from './tag-said.ts';


export type Segment = { text: string } | { hole: string };

const seg = (text: string): Segment => ({ text });
const hole = (label: string): Segment => ({ hole: label });

const MARK = '\u0000';

const phrase = (key: string, parts: Record<string, Segment>, values: Record<string, unknown> = {}): Segment[] => {
  const marks = Object.fromEntries(Object.keys(parts).map(name => [name, `${MARK}${name}${MARK}`]));
  return (t(key, { ...values, ...marks }) as string).split(MARK)
    .flatMap((chunk, at) => (at % 2 ? [parts[chunk]!] : chunk.trim() ? [seg(chunk.trim())] : []));
};

export function countWord(system: System, count: unknown, names?: ReadonlyMap<string, string>): string {
  if (typeof count !== 'object' || count === null) return String(count ?? 1);
  const expr = String((count as { expr?: unknown }).expr ?? '').trim();
  if (!expr) return '…';
  const tag = /^@([\p{L}\p{N}_]+)$/u.exec(expr)?.[1];
  if (tag) return fieldOf(system, tag)?.label || names?.get(tag) || formulaAsLabels(system, expr, names);
  return formulaAsLabels(system, expr, names);
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
    const n = typeof read === 'object' && read.kind === 'count' ? read.atLeast : undefined;
    return typeof n === 'number' ? t('readback:reading.successFrom', { n }) : t('readback:reading.count');
  }
  if (kind === 'best') return t('readback:reading.best');
  if (kind === 'worst') return t('readback:reading.worst');
  return String(kind);
}

export type Names = Map<string, string>;

const sheetWords = (): Record<string, string> => ({ [HOLDER]: NAME_LABELS.holder, [DESK_ID]: NAME_LABELS.desk });

const sheetLabel = (effect: Effect, name: string): string | null => {
  const param = effect.params?.find(p => p.key === name && p.kind === 'sheet');
  if (param) return param.label ?? param.key;
  const loop = (effect.steps ?? []).find(step => splitsTargets(step)) as { of?: unknown } | undefined;
  const one = loop ? loopOf(effect.params, loop) : null;
  if (one?.key === name) return one.label.toLowerCase();
  return sheetWords()[name] ?? null;
};

const onSheet = (effect: Effect, name: string): { sheet: string; rest: string } | null => {
  const dot = name.indexOf('.');
  if (dot <= 0) return null;
  const sheet = sheetLabel(effect, name.slice(0, dot));
  return sheet ? { sheet, rest: name.slice(dot + 1) } : null;
};

export const whoOf = (effect: Effect, ref: unknown): string => {
  const name = /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((ref as { expr?: unknown } | undefined)?.expr ?? ''))?.[1];
  return name ? `«${sheetLabel(effect, name) ?? name}»` : t('readback:who.unknown');
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
      if (declared) return hole(t('readback:ref.input', { name: declared.label ?? alone }));
      if (sheet && hasField(system, sheet.rest)) return seg(t('readback:ref.onSheet', { field: labelOfTag(system, sheet.rest), sheet: sheet.sheet }));
      if (hasField(system, alone)) return seg(`«${labelOfTag(system, alone)}»`);
      if (!sheet) {
        const named = names?.get(alone) ?? names?.get(head);
        return seg(named ? `«${named}»` : t('readback:ref.result', { head }));
      }
    }
    return seg(formulaWords(system, text, names));
  }
  return hole(emptyAs);
}


const signWords = (): Record<string, string> => ({
  atLeast: t('readback:sign.atLeast'), over: t('readback:sign.over'), notOver: t('readback:sign.notOver'),
  under: t('readback:sign.under'), equals: t('readback:sign.equals'),
});

export function checkReadback(step: Step, system: System, effect: Effect, names?: Names): Segment[] {
  const s = step as any;
  return [
    refSegment(s.value, system, effect, t('readback:hole.checkWhat'), names),
    seg(signWords()[String(s.successWhen ?? 'atLeast')] ?? t('readback:sign.atLeast')),
    refSegment(s.versus, system, effect, t('readback:hole.versus'), names),
    seg('.'),
  ];
}

export function rollReadback(step: Step, system: System, effect: Effect, names?: Names): Segment[] {
  const r = step as any;
  const filled = (value: unknown): boolean => value !== undefined && value !== null;
  const out: Segment[] = r.id ? [seg(`${stepSaid(r)} =`)] : [];
  if (filled(r.field)) {
    const parts: Record<string, Segment> = { field: refSegment(r.field, system, effect, t('readback:hole.rollField'), names) };
    if (filled(r.second)) parts.second = refSegment(r.second, system, effect, t('readback:hole.rollSecond'), names);
    if (filled(r.shift)) parts.shift = refSegment(r.shift, system, effect, '', names);
    const key = filled(r.second) ? (filled(r.shift) ? 'fieldSecondShift' : 'fieldSecond') : filled(r.shift) ? 'fieldShift' : 'field';
    out.push(...phrase(`readback:roll.${key}`, parts));
    return out;
  }
  out.push(seg(filled(r.by) ? t('readback:roll.throws', { who: whoOf(effect, r.by) }) : t('readback:roll.noOwner')));
  out.push(filled(r.die) ? refSegment(r.die, system, effect, t('readback:hole.rollWhat'), names) : hole(t('readback:hole.rollWhat')));
  if (filled(r.count)) out.push(seg('×'), refSegment(r.count, system, effect, t('readback:hole.diceCount'), names));
  if (filled(r.times)) out.push(...phrase('readback:roll.times', { n: refSegment(r.times, system, effect, t('readback:hole.times'), names) }));
  if (filled(r.keep)) out.push(...phrase(r.keepWorst === true ? 'readback:roll.keepWorst' : 'readback:roll.keepBest', { n: refSegment(r.keep, system, effect, t('readback:hole.howMany'), names) }));
  if (filled(r.bonus)) {
    const bonus = refSegment(r.bonus, system, effect, t('readback:hole.bonus'), names);
    if (!('text' in bonus) || (bonus.text !== '0' && bonus.text !== '')) out.push(seg('+'), bonus);
  }
  const tags = ((r.tags ?? []) as unknown[]).filter((tag): tag is string => typeof tag === 'string');
  if (tags.length) out.push(seg(`(${tagsSaid(system, tags)})`));
  return out;
}

export function amountValueSegments(step: Step, system: System, effect: Effect, names?: Names): Segment[] {
  const s = step as any;
  const out: Segment[] = [];
  if (s.die) out.push(refSegment(s.die, system, effect, t('readback:hole.whichDice'), names));
  if (s.fixed) {
    if (out.length) out.push(seg('+'));
    out.push(refSegment(s.fixed, system, effect, t('readback:hole.howMany'), names));
  }
  if (!out.length) out.push(hole(t('readback:hole.howMany')));
  if (s.bonus !== undefined && s.bonus !== null) {
    const bonus = refSegment(s.bonus, system, effect, '', names);
    if (!('text' in bonus) || (bonus.text !== '0' && bonus.text !== '')) out.push(seg('+'), bonus);
  }
  return out;
}

function exprSegments(expr: string, amount: Step | null, system: System, effect: Effect, names?: Names): Segment[] {
  const id = String((amount as any)?.id ?? '');
  const out: Segment[] = [];
  let rest = shownFormula(expr).trim();
  if (!rest) return [hole(t('readback:hole.becomes'))];
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
        ?? (hasField(system, field) ? (sheet ? t('readback:ref.withSheet', { name: labelOfTag(system, field), sheet: sheet.sheet }) : labelOfTag(system, field)) : null)
        ?? (sheet && system.effects?.[field] ? t('readback:ref.withSheet', { name: system.effects[field]!.label ?? field, sheet: sheet.sheet }) : null);
      out.push(label ? seg(`«${label}»`) : hole(t('readback:expr.missing', { name })));
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
      what = known ? seg(`«${known.label ?? id}».`) : hole(t('readback:status.unknown', { id: id || '?' }));
    } else what = refSegment(ref, system, effect, t('readback:hole.whichState'), names);
    if ((s.mode ?? 'apply') === 'remove' && s.by === 'tag') {
      return [seg(t('readback:status.removeByTag', { who: whoOf(effect, s.to) })), typeof ref === 'string' && ref ? seg(`«${tagSaid(system, ref)}».`) : hole(t('readback:hole.whichTag'))];
    }
    return (s.mode ?? 'apply') === 'remove'
      ? [seg(t('readback:status.remove', { who: whoOf(effect, s.to) })), what]
      : [seg(t('readback:status.put', { who: whoOf(effect, s.to) })), what, ...(effect.bond && s.unbound === true ? [seg(t('readback:status.stays'))] : [])];
  }
  const field = refSegment(s.target, system, effect, t('readback:hole.whichField'), names);

  const expr = s.value && typeof s.value === 'object' && 'expr' in s.value
    ? String(s.value.expr ?? '') : null;
  const whole = amount && expr !== null && expr.trim() === `@${String((amount as { id?: unknown }).id ?? '')}`;
  const lone = expr !== null && /^\s*@[\p{L}\p{N}_.]+\s*$/u.test(expr);
  const what = expr !== null && !whole && !lone
    ? exprSegments(expr, amount, system, effect, names)
    : amount && (whole || expr === null)
      ? amountValueSegments(amount, system, effect, names)
      : [refSegment(s.value, system, effect, t('readback:hole.howMany'), names)];
  const direction = s.direction ?? 'subtract';
  if (direction === 'set') return [field, seg(t('readback:change.set')), ...what, seg('.')];
  if (direction === 'add') return [field, seg(t('readback:change.add')), ...what, seg('.')];
  return [field, seg(t('readback:change.subtract')), ...what, seg('.')];
}

export function askReadback(step: Step, effect: Effect): Segment[] {
  const s = step as Record<string, unknown>;
  const word = (value: unknown, fallback: string) => (typeof value === 'string' && value.trim() ? value.trim() : fallback);
  const to = s.to ? whoOf(effect, s.to) : askWhom();
  const question = typeof s.question === 'string' && s.question.trim() ? `«${s.question.trim()}»` : t('readback:ask.noQuestion');
  return [{ text: t('readback:ask.line', { to, question, yes: word(s.yes, NAME_LABELS.yes), no: word(s.no, NAME_LABELS.no) }) }];
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
  if (fromInput) {
    const input = via?.label ?? fromInput;
    return [seg(typeof via?.default === 'string'
      ? t('readback:send.fromInputDefault', { input, name: system.effects?.[via.default]?.label ?? via.default })
      : t('readback:send.fromInput', { input }))];
  }
  const name = id ? seg(`«${event?.label || id}»${main ? ':' : ''}`) : hole(t('readback:hole.whichEffect'));
  const amount = !main ? [] : [sent === undefined ? hole(t('readback:hole.howMany')) : refSegment(sent, system, effect, t('readback:hole.howMany'), names)];
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
    if (!given.length) return [seg(t('readback:send.nothing'))];
    return given.flatMap((p, i) => [
      seg(`${i ? '; ' : ''}${p.label ?? p.key}:`),
      p.kind === 'sheet' ? seg(whoOf(effect, args[p.key]))
        : pickedRow(system, p, args[p.key]) ? seg(`«${pickedRow(system, p, args[p.key])!.label}»`)
          : refSegment(args[p.key], system, effect, '…', names),
    ]).concat(seg('.'));
  }
  return [
    seg(t('readback:send.calls')), name, ...amount,
    ...(tags.length ? [seg(`[${tags.join(', ')}]`)] : []),
    seg('.'),
  ];
}

export function numberReadback(step: Step, system: System, effect: Effect, names?: Names): Segment[] {
  const by = (step as { by?: unknown }).by;
  return [seg(by ? t('readback:number.throws', { who: whoOf(effect, by) }) : t('readback:number.counted')), ...amountValueSegments(step, system, effect, names), seg('.')];
}

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
      return (n === 1 ? t('readback:op.addDieOne') : t('readback:op.addDie', { count: n })) + only;
    case 'wild':
      return t('readback:op.wild');
    case 'keepBest':
      return (n === 1 ? t('readback:op.keepBestOne') : t('readback:op.keepBest', { n })) + only;
    case 'keepWorst':
      return (n === 1 ? t('readback:op.keepWorstOne') : t('readback:op.keepWorst', { n })) + only;
    case 'dieStep':
      return (by >= 0
        ? t('readback:op.dieStepUp', { count: by })
        : t('readback:op.dieStepDown', { count: -by })) + only;
    case 'shiftVersus':

      return by <= 0 ? t('readback:op.easier', { n: -by }) : t('readback:op.harder', { n: by });
    case 'shiftDegree':
      return by >= 0
        ? t('readback:op.degreeUp', { n: by })
        : t('readback:op.degreeDown', { n: -by });
    case 'explode': {
      const once = Number(op.limit) === 1;
      return String(op.at ?? 'max') === 'min'
        ? t(once ? 'readback:op.explodeMinOnce' : 'readback:op.explodeMinWhile') + only
        : t(once ? 'readback:op.explodeMaxOnce' : 'readback:op.explodeMaxWhile') + only;
    }
    case 'reroll':
      return (n === 1
        ? t('readback:op.rerollOnes')
        : t('readback:op.rerollUpTo', { n })) + only;
    case 'flip':
      return (String(op.prefer ?? 'low') === 'high'
        ? t('readback:op.flipHigh')
        : t('readback:op.flipLow')) + only;
    case 'floorDie':
      return t('readback:op.floorDie', { n: Number(op.least ?? 10) }) + only;
    case 'plus': {
      const said = plusWords(op, system);
      return said.startsWith('−') ? t('readback:op.minus', { said: said.slice(1) }) : t('readback:op.plus', { said });
    }
    default:
      return String(op.op);
  }
}

export function addendWords(system: System, source: Record<string, unknown>): string {
  const text = (ref: unknown): string => String((ref as { expr?: unknown } | undefined)?.expr ?? '').trim();
  const die = source.die;
  if (die !== undefined && die !== null && die !== '') {
    const raw = typeof die === 'string' ? die : text(die);
    const head = system.constants?.[raw] ? dieWord(system, raw)
      : raw.startsWith('@') ? formulaWords(system, raw)
        : asDice(raw.replace(/^(["'])(.*)\1$/su, '$2'));
    const times = source.count !== undefined && source.count !== null ? `${formulaWords(system, text(source.count))} × ` : '';
    return `${source.minus === true ? '−' : '+'} ${times}${head}`;
  }
  const value = text(source.value);
  if (!value) return '+ …';
  const said = formulaWords(system, value);
  return /^[-−]/u.test(said) ? `− ${said.slice(1).trim()}` : `+ ${said}`;
}

function plusWords(op: Record<string, unknown>, system: System): string {
  return addendWords(system, op).replace(/^([+−]) /u, '$1').replace(/^\+/u, '');
}

const LADDER = [4, 6, 8, 10, 12, 20];

const written = (count: number, sides: number): string => `${count > 1 ? count : ''}${dieLetter()}${sides}`;

function simpleDie(system: System): { count: number; sides: number } | null {
  const dice = Object.values(system.constants ?? {}).filter(c => c.kind === 'die');
  if (dice.length !== 1) return null;
  const terms = dice[0]!.dice ?? [];
  const read = dice[0]!.read;
  const kind = typeof read === 'string' ? read : read?.kind ?? 'sum';
  const term = terms[0];
  if (terms.length !== 1 || !term || kind !== 'sum' || term.name) return null;
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
      case 'wild': tail.push(t('readback:note.wild')); break;
      case 'keepBest': tail.push(n === 1 ? t('readback:note.best') : t('readback:note.bestN', { n })); break;
      case 'keepWorst': tail.push(n === 1 ? t('readback:note.worst') : t('readback:note.worstN', { n })); break;
      case 'dieStep': {
        const at = LADDER.indexOf(sides);
        if (at >= 0) sides = LADDER[Math.min(LADDER.length - 1, Math.max(0, at + by))]!;
        break;
      }
      case 'floorDie': tail.push(t('readback:note.floor', { n: Number(op.least ?? 10) })); break;
      case 'reroll': tail.push(n === 1 ? t('readback:note.rerollOnes') : t('readback:note.rerollUpTo', { n })); break;
      case 'explode': tail.push(op.apart ? t('readback:note.explodeApart') : String(op.at ?? 'max') === 'min' ? t('readback:note.explodeMin') : t('readback:note.explodeMax')); break;
      case 'flip': tail.push(String(op.prefer ?? 'low') === 'high' ? t('readback:note.flipHigh') : t('readback:note.flipLow')); break;
      case 'plus': {
        const said = plusWords(op, system);
        more.push(said.startsWith('−') ? ` − ${said.slice(1)}` : ` + ${said}`);
        break;
      }
      case 'shiftVersus': words.push(by <= 0 ? t('readback:note.easier', { n: -by }) : t('readback:note.harder', { n: by })); break;
      case 'shiftDegree': words.push(by >= 0 ? t('readback:note.degreeUp', { n: by }) : t('readback:note.degreeDown', { n: -by })); break;
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
  if (!ops.length) return [hole(t('readback:hole.editDoes'))];

  const phrases = ops.map(op => opPhrase(op, system));
  const head = phrases[0]!;
  const text = head.charAt(0).toUpperCase() + head.slice(1)
    + (phrases.length > 1 ? ', ' + phrases.slice(1).join(', ') : '');
  const out: Segment[] = [seg(text + '.')];

  if (edit.cancels?.length) {
    out.push(seg(t('readback:edit.cancels', { list: edit.cancels.map(key => system.roll_edits?.[key]?.label || key).join(', ') })));
  }
  return out;
}


export function dieReadback(constant: SystemConstant, system: System, driven = false): Segment[] {
  const lone = (constant.dice ?? []).length === 1 && (constant.dice![0]!.count === undefined || constant.dice![0]!.count === null);
  if (driven && lone) {
    const read = constant.read;
    const how = typeof read === 'string' ? read : read?.kind ?? 'sum';
    const least = typeof read === 'object' && read.kind === 'count' ? read.atLeast : undefined;
    const end = how === 'best' ? t('readback:die.best') : how === 'worst' ? t('readback:die.worst') : how === 'count' ? t('readback:die.count', { n: least ?? '?' }) : t('readback:die.sum');
    return [seg(t('readback:die.driven', { die: `${dieLetter()}${constant.dice![0]!.sides}`, end }))];
  }

  const dice = (constant.dice ?? []).map(d => {
    const head = typeof d.count === 'object' && d.count !== null
      ? t('readback:die.byCount', { die: `${dieLetter()}${d.sides}`, count: countWord(system, d.count) })
      : diceText(d.count, d.sides);

    return d.name ? `${head} (${d.label || d.name})` : head;
  }).map((text, at) => (at === 0 ? text : ` + ${text}`)).join('');
  if (!dice) return [hole(t('readback:hole.dieParts'))];

  const read = constant.read;
  const kind = typeof read === 'string' ? read : read?.kind ?? 'sum';
  const atLeast = typeof read === 'object' && read.kind === 'count' ? read.atLeast : undefined;

  const single = (constant.dice ?? []).length === 1
    && ((constant.dice ?? [])[0]!.count ?? 1) === 1;
  if (single && kind === 'sum') return [seg(t('readback:die.throw', { dice }))];

  const tail = kind === 'best' ? t('readback:die.best')
    : kind === 'worst' ? t('readback:die.worst')
      : kind === 'count'
        ? t('readback:die.count', { n: atLeast ?? '?' })
        : t('readback:die.sum');
  return [seg(t('readback:die.throwAnd', { dice, tail }))];
}

export function dieSaid(constant: SystemConstant, system: System, counted: boolean, names?: ReadonlyMap<string, string>): string | null {
  const terms = constant.dice ?? [];
  if (!terms.length) return null;
  const read = constant.read;
  const kind = typeof read === 'string' ? read : read?.kind ?? 'sum';
  const atLeast = typeof read === 'object' && read.kind === 'count' ? read.atLeast : undefined;
  const lone = terms.length === 1;
  if (lone && kind === 'sum' && (terms[0]!.count ?? 1) === 1) return null;
  const dice = terms.map(term => {
    const head = counted && lone ? `${dieLetter()}${term.sides}`
      : typeof term.count === 'object' && term.count !== null ? t('readback:die.byCount', { die: `${dieLetter()}${term.sides}`, count: countWord(system, term.count, names) })
        : diceText(term.count, term.sides);
    return term.name ? `${head} «${term.label || term.name}»` : head;
  }).map((text, at) => (at === 0 ? text : ` + ${text}`)).join('');
  const tail = kind === 'best' ? t('readback:said.best')
    : kind === 'worst' ? t('readback:said.worst')
      : kind === 'count' ? t('readback:said.count', { n: atLeast ?? '?' })
        : t('readback:said.sum');
  return t('readback:said.line', { dice, tail });
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
    return [{ text: read.which === 'lowest' ? t('readback:seen.lowest') : t('readback:seen.upTo', { n: words(read.upTo) }) }];
  }
  if (step.type === 'roll-add') {
    const keep = read.keep === 'best' ? t('readback:seen.keepBest') : read.keep === 'worst' ? t('readback:seen.keepWorst') : '';
    return [{ text: `${words(read.count)}${read.sides ? ` ${dieLetter()}${words(read.sides)}` : ''}${keep}` }];
  }
  if (step.type === 'roll-plus') return [{ text: addendWords(system, read) }];
  if (step.type === 'roll-bump') return [{ text: t('readback:seen.bump', { n: words(read.value) }) }];
  return [];
}
