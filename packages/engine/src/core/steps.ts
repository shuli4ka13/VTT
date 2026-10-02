import { compile } from '../formula/index.ts';
import { EngineError } from '../engine/errors.ts';
import { dieConstant } from '../engine/lead-die.ts';
import { lookupDegree } from '../engine/tables.ts';
import { readCell } from '../engine/cells.ts';
import { findField } from '../engine/calc.ts';
import { applyValueModifiers } from '../engine/modifiers.ts';
import { incomingTagOf } from '../engine/targets.ts';
import { lonelyField } from '../engine/refs.ts';
import { requireCalled } from '../engine/effects.ts';
import { amountParamOf } from '../model/lists.ts';
import { VALUE_COLUMN } from '../model/tables.ts';
import { parse, withCount, times, start, result, see } from './dice.ts';
import type { Roll, RollResult, Spec, SeenOp } from './dice.ts';
import type { Thrown } from './roll.ts';
import type { EmittedEvent, NestedRun } from '../engine/rule.ts';
import type { Pass } from '../engine/calc.ts';
import type { Die, Step, StoredValue, System } from '../model/types.ts';

export type StepData = Step & Record<string, any>;

export interface Ctx {
  system: System;
  owner: string;
  die: Die;
  here: Pass;
  value(ref: unknown): unknown;
  known(ref: unknown): boolean;
  number(ref: unknown, what: string): number;
  optional(ref: unknown, what: string): number | null;
  holds(guard: unknown): boolean;
  roll(side: 'sender' | 'target', spec: Spec, tags: string[]): Thrown;
  read(tag: string): unknown;
  write(tag: string, value: StoredValue): void;
  attach(effectId: string, carry?: number): void;
  detach(effectId: string): void;
  edited(call: string, param: string, base: number, tags: string[], args: Record<string, unknown>): number;
  call(event: string, args: Record<string, unknown>, payload: EmittedEvent): NestedRun;
  reply(event: string, args: Record<string, unknown>): void;
  seenRoll?: { value: Roll };
  using(die: Die): Ctx;
}

export interface StepOut {
  value?: unknown;
  trace: Record<string, unknown>;
  break?: { reason: string; note?: string } | null;
  roll?: RollResult;
}

export interface Runner {
  once?: (step: StepData) => boolean;
  mayBreak?: boolean;
  splits?: boolean;
  prepare?: (step: StepData, ctx: Ctx) => Prepared;
  finish: (step: StepData, ctx: Ctx, prepared?: Prepared) => StepOut;
}

export interface Prepared {
  summary?: RollResult;
  [k: string]: unknown;
}

const who = (ctx: Ctx): string => ctx.owner || 'правило';

const LITERAL = /^(\d+)?\s*[dдк]\s*(\d+)$/iu;

function specOf(ctx: Ctx, die: unknown, count: unknown): Spec {
  let spec: Spec;
  if (die && typeof die === 'object' && 'const' in (die as object)) {
    const text = String((die as { const: unknown }).const ?? '');
    if (!LITERAL.test(text.trim())) throw new EngineError(`«${text}» — не запись кости; жду вроде «1к20» или «2к6»`);
    spec = parse(text);
  } else {
    const constant = (die as { constant?: string } | undefined)?.constant;
    if (!constant) throw new EngineError(`${who(ctx)}: порогу нужна кость — слот roll.die ссылается на константу системы`);
    spec = parse(dieConstant(ctx.system, constant), (ref, what) => ctx.number(ref, what));
  }
  if (count === undefined || count === null) return spec;
  return withCount(spec, ctx.number(count, 'сколько костей'), who(ctx));
}

function tagsOf(raw: unknown, ctx: Ctx): string[] {
  const list = Array.isArray(raw) ? raw : [];
  return [...new Set(list.flatMap(tag => {
    if (typeof tag === 'string') return [tag];
    const value = ctx.value(tag);
    if (Array.isArray(value)) return value.map(String);
    return value === null || value === undefined || value === '' ? [] : [String(value)];
  }))];
}

const OUTCOMES: Record<string, (total: number, versus: number) => { success: boolean; margin: number }> = {
  atLeast: (total, versus) => ({ success: total >= versus, margin: total - versus }),
  notOver: (total, versus) => ({ success: total <= versus, margin: versus - total }),
  over: (total, versus) => ({ success: total > versus, margin: total - versus }),
  under: (total, versus) => ({ success: total < versus, margin: versus - total }),
  equals: (total, versus) => ({ success: total === versus, margin: -Math.abs(total - versus) }),
};

type RollSpec = { die?: unknown; count?: unknown; bonus?: unknown; tags?: unknown[] };

const opposedOf = (versus: unknown): RollSpec | null =>
  (versus && typeof versus === 'object' && 'roll' in (versus as object) ? (versus as { roll: RollSpec }).roll : null);

const summaryOf = (thrown: Thrown, bonus: number | null): RollResult =>
  ({ ...thrown.result, total: thrown.result.total + (bonus ?? 0) + thrown.bonus });

const threshold: Runner = {
  once: step => (step.side || 'sender') !== 'target',
  mayBreak: true,
  prepare(step, ctx) {
    const roll = step.roll || {};
    const tags = tagsOf(roll.tags, ctx);
    const thrown = ctx.roll('sender', specOf(ctx, roll.die, roll.count), tags);
    const bonus = roll.bonus !== undefined && roll.bonus !== null && ctx.known(roll.bonus)
      ? (ctx.optional(roll.bonus, 'бонус порога') ?? 0) : null;
    return { thrown, tags, bonus, summary: summaryOf(thrown, bonus) };
  },
  finish(step, ctx, prepared) {
    const side = step.side || 'sender';
    const roll = step.roll || {};
    const early = side === 'target' ? versusOf(step.versus, side, ctx) : null;
    let thrown = prepared?.thrown as Thrown | undefined;
    let tags = (prepared?.tags as string[] | undefined) ?? [];
    if (!thrown) {
      tags = tagsOf(roll.tags, ctx);
      thrown = ctx.roll(side, specOf(ctx, roll.die, roll.count), tags);
    }
    const known = prepared?.bonus as number | null | undefined;
    const bonus = (known ?? ctx.optional(roll.bonus, 'бонус порога') ?? 0) + thrown.bonus;
    const rolled = thrown.result;
    const total = rolled.total + bonus;
    const shift = thrown.roll.claim.versusShift;
    const successWhen = String(step.successWhen || 'atLeast');
    if (!OUTCOMES[successWhen]) throw new EngineError(`${who(ctx)}: неизвестное условие успеха «${successWhen}»`);
    const eased = successWhen === 'notOver' || successWhen === 'under' ? -shift : shift;
    const against = early ?? versusOf(step.versus, side, ctx);
    const versus = against.value + eased;
    const judged = OUTCOMES[successWhen]!(total, versus);
    const succeedOn = ctx.optional(step.succeedOn, 'кость верного успеха');
    const failOn = ctx.optional(step.failOn, 'кость верного провала');
    const natural = rolled.natural;
    const forced = failOn !== null && natural <= failOn ? false : succeedOn !== null && natural >= succeedOn ? true : null;
    const success = forced ?? judged.success;
    const scale = step.degrees && step.degrees.table ? step.degrees : null;
    const degree = scale
      ? lookupDegree(ctx.system, scale.table, scale.of === 'margin' ? judged.margin : total, thrown.roll.claim.degreeShift, ctx.owner)
      : null;
    const lone = lonelyField(step.versus, ctx.system);
    const faces = thrown.roll.dice.map(d => (d.minus ? -d.face : d.face));
    const value = {
      success, margin: judged.margin, total, natural,
      rolled: rolled.rolled, atMax: rolled.atMax, atMin: rolled.atMin, edited: rolled.edited,
      ...(scale ? { degree } : {}),
      dice: rolled.dice, parts: rolled.parts, versus,
      ...(against.against ? { against: against.against, versusNatural: against.against.natural } : {}),
    };
    const goOn = step.continueOn === 'always' ? true : step.continueOn === 'fail' ? !success : success;
    return {
      value,
      roll: { ...rolled, total },
      trace: {
        rolls: rolled.dice.rolls, kept: rolled.dice.kept, bonus, total,
        ...(tags.length ? { tags } : {}),
        ...(faces.some((v, i) => v !== rolled.dice.rolls[i]) ? { raw: faces } : {}),
        ...(thrown.roll.claim.read.kind !== 'sum' ? { read: thrown.roll.claim.read.kind } : {}),
        ...(thrown.roll.edits.length ? { edits: thrown.roll.edits } : {}),
        versus: lone ? { tag: lone, value: versus } : { value: versus },
        margin: judged.margin, success,
        ...(forced !== null ? { forced: natural } : {}),
        ...(against.against ? { against: against.against } : {}),
        ...(scale ? { degree } : {}),
        ...(Object.keys(rolled.parts).length ? { parts: rolled.parts } : {}),
      },
      break: goOn ? null : { reason: step.continueOn === 'fail' ? 'threshold-held' : 'threshold-miss' },
    };
  },
};

function versusOf(versus: unknown, side: string, ctx: Ctx): { value: number; against?: Record<string, any> } {
  const opposed = opposedOf(versus);
  if (!opposed) return { value: ctx.number(versus, 'порогу не с чем сравнить бросок') };
  const tags = tagsOf(opposed.tags, ctx);
  const thrown = ctx.roll(side === 'target' ? 'sender' : 'target', specOf(ctx, opposed.die, opposed.count), tags);
  const bonus = (ctx.optional(opposed.bonus, 'прибавка встречного броска') ?? 0) + thrown.bonus;
  const total = thrown.result.total + bonus;
  const read = thrown.roll.claim.read.kind;
  return {
    value: total,
    against: {
      natural: thrown.result.natural, total, bonus, rolls: thrown.result.dice.rolls, kept: thrown.result.dice.kept,
      ...(read !== 'sum' ? { read } : {}),
      ...(tags.length ? { tags } : {}),
    },
  };
}

const SOURCES = ['roll', 'margin', 'item'];

function notationOf(ref: unknown, ctx: Ctx): Spec | null {
  if (!ref) return null;
  if (typeof ref === 'object' && ref !== null && 'constant' in ref) {
    const spec = parse(dieConstant(ctx.system, String((ref as { constant: unknown }).constant)));
    if (spec.terms.length !== 1) throw new EngineError(`«${spec.label || String((ref as { constant: unknown }).constant)}» — составная кость, её бросает проверка, а числом её не записать`);
    return spec;
  }
  const text = ctx.value(ref);
  return text === null || text === undefined || text === '' ? null : parse(String(text));
}

function watchedDie(ctx: Ctx, thrown: { sides: number; value: number }[]): Die {
  return sides => { const value = ctx.die(sides); thrown.push({ sides, value }); return value; };
}

function tally(thrown: { sides: number; value: number }[]): Pick<RollResult, 'rolled' | 'atMax' | 'atMin'> {
  return {
    rolled: thrown.length,
    atMax: thrown.filter(one => one.value === one.sides).length,
    atMin: thrown.filter(one => one.value === 1).length,
  };
}

function withDie<T>(ctx: Ctx, die: Die, work: (inner: Ctx) => T): T {
  return work(ctx.using(die));
}

const amount: Runner = {
  once: () => true,
  prepare(step, ctx) {
    const source = String(ctx.value(step.source) ?? step.source);
    if (!SOURCES.includes(source)) throw new EngineError(`${who(ctx)}: неизвестный источник величины «${source}» — умею: ${SOURCES.join(', ')}`);
    const written = notationOf(step.dice, ctx);
    if (source === 'roll' && !written) throw new EngineError(`${who(ctx)}: источнику «свой бросок» нужны кости — слот dice пуст`);
    if (source === 'margin' && !step.margin) throw new EngineError(`${who(ctx)}: источнику «превышение» нужен слот margin — превышение какого шага брать?`);
    const many = step.count === undefined || step.count === null ? null : Math.max(0, Math.floor(ctx.number(step.count, 'сколько раз кинуть кости')));
    const doubled = written !== null && step.double !== undefined && step.double !== null && ctx.holds(step.double);
    const spec = written === null ? null : times(written, (many ?? 1) * (doubled ? 2 : 1));
    const thrown: { sides: number; value: number }[] = [];
    const rolled = spec && spec.terms.every(t => t.count > 0) ? start(spec, [], watchedDie(ctx, thrown)) : null;
    const slot = (ref: unknown, what: string): number | null | undefined => {
      if (ref === undefined || ref === null) return null;
      if (!ctx.known(ref)) return undefined;
      return withDie(ctx, watchedDie(ctx, thrown), inner => inner.optional(ref, what));
    };
    const fixed = slot(step.fixed, 'фикс величины');
    if (source === 'item' && fixed === null) throw new EngineError(`${who(ctx)}: источнику «фикс предмета» нужен заполненный слот fixed`);
    const bonus = slot(step.bonus, 'бонус величины');
    const margin = slot(step.margin, 'превышение для величины');
    const rolls = thrown.map(one => one.value);
    const natural = rolls.reduce((sum, v) => sum + v, 0);
    const constBonus = typeof bonus === 'number' && step.bonus && typeof step.bonus === 'object' && 'const' in step.bonus ? bonus : 0;
    const summary: RollResult = {
      total: (rolled ? result(rolled).total : natural) + constBonus, natural,
      ...tally(thrown), edited: false, dice: { rolls, kept: null }, parts: {}, tags: [],
    };
    const scaled = step.scale !== undefined && step.scale !== null;
    const whole = !scaled && fixed !== undefined && bonus !== undefined && margin !== undefined;
    return {
      ...(whole ? { value: (rolled ? result(rolled).total : 0) + (fixed ?? 0) + (bonus ?? 0) + (margin ?? 0) } : {}),
      source, notation: spec ? `${spec.terms[0]!.count}d${spec.terms[0]!.sides}` : null,
      diceTotal: rolled ? result(rolled).total : 0, rolls, thrown,
      ...(doubled ? { doubled: true } : {}), ...(many !== null ? { times: many } : {}),
      fixed, bonus, margin, summary,
    };
  },
  finish(step, ctx, prepared) {
    const p = prepared ?? amount.prepare!(step, ctx);
    const thrown = [...(p.thrown as { sides: number; value: number }[])];
    const late = (known: unknown, ref: unknown, what: string): number => (known === undefined
      ? withDie(ctx, watchedDie(ctx, thrown), inner => inner.optional(ref, what) ?? 0)
      : (known as number | null) ?? 0);
    const flat = late(p.fixed, step.fixed, 'фикс величины');
    const bonus = late(p.bonus, step.bonus, 'бонус величины');
    const margin = late(p.margin, step.margin, 'превышение для величины');
    const full = (p.diceTotal as number) + flat + bonus + margin;
    const scale = step.scale as { times?: unknown; when?: unknown } | undefined;
    let share: number | null = null;
    if (scale) {
      const n = Number(ctx.value(scale.times));
      if (!Number.isFinite(n) || n <= 0) throw new EngineError(`${who(ctx)}: доля величины должна быть положительным числом, а пришло ${JSON.stringify(scale.times)}`);
      share = ctx.holds(scale.when) ? n : null;
    }
    const total = share === null ? full : Math.floor(full * share);
    const rolls = thrown.map(one => one.value);
    return {
      value: total,
      roll: { ...(p.summary as RollResult), dice: { rolls, kept: null }, ...tally(thrown) },
      trace: {
        source: p.source, notation: p.notation, rolls,
        ...(p.doubled ? { doubled: true } : {}),
        ...(p.times !== undefined ? { times: p.times } : {}),
        ...(share === null ? {} : { share, full }),
        flat, bonus, margin, total,
      },
      break: null,
    };
  },
};

const BREAKS: Record<string, (margin: number) => boolean> = {
  less: margin => margin < 0,
  atMost: margin => margin <= 0,
  never: () => false,
};

const compare: Runner = {
  mayBreak: true,
  finish(step, ctx) {
    const breakIf = String(step.breakIf || 'less');
    if (!BREAKS[breakIf]) throw new EngineError(`${who(ctx)}: неизвестное условие обрыва «${breakIf}» — умею: ${Object.keys(BREAKS).join(', ')}`);
    const value = ctx.number(step.value, 'сравниваемая величина');
    const versus = ctx.number(step.versus, 'сравнению не с чем сопоставить величину');
    const margin = value - versus;
    const broke = BREAKS[breakIf]!(margin);
    const of = lonelyField(step.value, ctx.system);
    const against = lonelyField(step.versus, ctx.system);
    const noteRaw = step.note && typeof step.note === 'object' ? ctx.value(step.note) : step.note;
    const note = typeof noteRaw === 'string' && noteRaw.trim() ? noteRaw.trim() : null;
    return {
      value: { margin, value, versus },
      trace: {
        value, ...(of ? { of } : {}),
        versus: against ? { tag: against, value: versus } : { value: versus },
        margin, passed: !broke,
      },
      break: broke ? { reason: 'compare-short', ...(note ? { note } : {}) } : null,
    };
  },
};

const DIRECTIONS: Record<string, (from: number, x: number) => number> = {
  add: (from, x) => from + x,
  subtract: (from, x) => from - x,
  set: (_from, x) => x,
};

function boundOf(bound: unknown, pass: Pass, what: string): number | null {
  if (bound === undefined || bound === null || bound === '') return null;
  const value = typeof bound === 'number' ? bound : compile(String(bound)).evaluate(pass.resolve);
  if (typeof value !== 'number') throw new EngineError(`${what} — не число (${JSON.stringify(bound)} даёт ${typeof value})`);
  return value;
}

const apply: Runner = {
  finish(step, ctx) {
    const direction = String(step.direction || 'subtract');
    if (!DIRECTIONS[direction]) throw new EngineError(`${who(ctx)}: неизвестное направление «${direction}» — умею: ${Object.keys(DIRECTIONS).join(', ')}`);
    const target = step.target;
    const tag = typeof target === 'string' ? target
      : target && typeof target === 'object' && 'tag' in target ? String(target.tag)
        : String(ctx.value(target));
    const field = findField(ctx.system, tag);
    if (!field) throw new EngineError(`система не объявляет поля «${tag}» — применять некуда`);
    if (field.value.kind !== 'stored') throw new EngineError(`в поле «${tag}» нельзя писать: его считает движок по формуле, а не эффект`);
    const from = ctx.read(tag);
    const raw = ctx.value(step.value);
    if (direction === 'set' && (typeof from !== 'number' || typeof raw !== 'number')) {
      ctx.write(tag, raw as StoredValue);
      return { value: { amount: raw, from, to: raw, overkill: 0 }, trace: { target: tag, direction, incoming: raw, amount: raw, from, to: raw }, break: null };
    }
    if (typeof from !== 'number') throw new EngineError(`поле «${tag}» держит не число (${typeof from}) — прибавлять и вычитать нечего`);
    if (typeof raw !== 'number') throw new EngineError(`${who(ctx)}: величина применения — не число (даёт ${raw === null ? 'пусто' : typeof raw})`);
    const value = raw;
    const incoming = direction === 'set' ? Math.abs(value - from) : value;
    const amountNow = step.targetModifiers ? Math.floor(Number(applyValueModifiers(incoming, incomingTagOf(tag), ctx.here))) : incoming;
    const next = direction === 'set' ? from + Math.sign(value - from) * amountNow : DIRECTIONS[direction]!(from, amountNow);
    const low = boundOf(field.value.min, ctx.here, 'нижняя граница поля');
    const high = boundOf(field.value.max, ctx.here, 'верхняя граница поля');
    const to = low !== null && next < low ? low : high !== null && next > high ? high : next;
    const overkill = low !== null && next < low ? low - next : 0;
    ctx.write(tag, to);
    return { value: { amount: amountNow, from, to, overkill }, trace: { target: tag, direction, incoming, amount: amountNow, from, to }, break: null };
  },
};

const MODES = ['apply', 'remove'];

const status: Runner = {
  finish(step, ctx) {
    const mode = String(step.mode || 'apply');
    if (!MODES.includes(mode)) throw new EngineError(`${who(ctx)}: у шага «состояние» нет режима «${mode}»; умею ${MODES.join(', ')}`);
    const id = ctx.value(step.effect);
    if (id === null || id === undefined || id === '') return { value: null, trace: { mode, effect: null }, break: null };
    if (typeof id !== 'string') throw new EngineError(`${who(ctx)}: состоянию нужен id эффекта, а пришло ${JSON.stringify(id)}`);
    const carry = mode === 'apply' ? ctx.optional(step.carry, 'число, которое запомнит наложенное') : null;
    if (mode === 'remove') ctx.detach(id);
    else ctx.attach(id, carry === null ? undefined : carry);
    return { value: id, trace: { mode, effect: id, ...(carry === null ? {} : { carry }) }, break: null };
  },
};

function chosenTags(params: { key: string; kind?: string; from?: string }[], args: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const param of params) {
    if (param.kind !== 'choice' || !param.from) continue;
    const value = args[param.key];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) out.push(...value.map(String));
    else out.push(String(value));
  }
  return out;
}

const emit: Runner = {
  mayBreak: true,
  finish(step, ctx) {
    const id = String(step.event ?? '');
    const spec = requireCalled(ctx.system, id, who(ctx));
    const params = spec.params ?? [];
    const args: Record<string, unknown> = {};
    for (const [key, ref] of Object.entries((step.args ?? {}) as Record<string, unknown>)) {
      const field = params.find(p => p.key === key)?.kind === 'tag' ? lonelyField(ref, ctx.system) : null;
      const value = field ?? ctx.value(ref);
      if (value !== null && value !== undefined) args[key] = value;
    }
    if (step.to === 'sender') {
      ctx.reply(id, args);
      return { value: { event: id, answered: true, args }, trace: { event: id, to: 'sender', args }, break: null };
    }
    const main = amountParamOf(spec);
    const incoming = main && args[main.key] !== undefined ? Number(args[main.key]) : 0;
    if (!Number.isFinite(incoming)) throw new EngineError(`«${main!.label ?? main!.key}» вызова «${spec.label ?? id}»: ждали число, пришло «${String(args[main!.key])}»`);
    const tags = chosenTags(params, args);
    const amountNow = main ? Math.floor(ctx.edited(id, main.key, incoming, tags, args)) : incoming;
    if (main) args[main.key] = amountNow;
    const payload: EmittedEvent = { event: id, amount: amountNow, incoming, tags };
    const out = ctx.call(id, args, payload);
    const received = out.stopped ? String(out.stopped.reason ?? 'оборвано') : null;
    const note = out.stopped?.note ?? null;
    return {
      value: payload,
      trace: { event: id, incoming, amount: payload.amount, tags, ...(received ? { received } : {}) },
      break: step.strict && received ? { reason: 'emit-stopped', ...(note ? { note } : {}) } : null,
    };
  },
};

const table: Runner = {
  finish(step, ctx) {
    const name = String(ctx.value(step.table) ?? '').trim();
    if (!name) throw new EngineError(`${who(ctx)}: шагу «таблица» не сказано, какую таблицу читать`);
    const rolls: number[] = [];
    let value: number;
    if (step.dice !== undefined && step.dice !== null) {
      const spec = notationOf(step.dice, ctx);
      if (!spec) throw new EngineError(`${who(ctx)}: шагу «таблица» нужен аргумент — число или кости`);
      const rolled = result(start(spec, [], ctx.die));
      rolls.push(...rolled.dice.rolls);
      value = rolled.total;
    } else if (step.value !== undefined && step.value !== null) {
      value = ctx.number(step.value, 'аргумент таблицы');
    } else {
      throw new EngineError(`${who(ctx)}: шагу «таблица» нужен аргумент — число или кости`);
    }
    const column = typeof step.column === 'string' && step.column ? step.column : VALUE_COLUMN;
    const found = readCell(ctx.system, ctx.here, name, value, column, ctx.owner);
    return { value: found, trace: { table: name, value, ...(rolls.length ? { rolls } : {}), result: found }, break: null };
  },
};

const each: Runner = { splits: true, finish: () => ({ value: null, trace: {}, break: null }) };

function operate(ctx: Ctx, label: string, op: SeenOp): StepOut {
  const cell = ctx.seenRoll;
  if (!cell) throw new EngineError(`${who(ctx)}: «${label}» работает только в подписке «увидев кости»`);
  const before = result(cell.value).total;
  cell.value = see(cell.value, op, ctx.die);
  const after = result(cell.value);
  return { value: { total: after.total, rolls: after.dice.rolls }, trace: { op: op.kind, before, after: after.total, rolls: after.dice.rolls }, break: null };
}

const rollAdd: Runner = {
  finish(step, ctx) {
    const keep = step.keep === 'best' || step.keep === 'worst' ? step.keep : undefined;
    const sides = ctx.optional(step.sides, 'грани докинутой кости');
    return operate(ctx, 'Докинуть', {
      kind: 'add', count: ctx.number(step.count, 'сколько костей докинуть'),
      ...(sides !== null ? { sides } : {}), ...(keep ? { keep } : {}),
      ...(step.explode === true || step.explode === 'true' ? { explode: true } : {}),
    });
  },
};

const rollReroll: Runner = {
  finish: (step, ctx) => operate(ctx, 'Перебросить', { kind: 'reroll', upTo: ctx.number(step.upTo, 'до какого значения перебрасывать') }),
};

const rollPlus: Runner = {
  finish: (step, ctx) => operate(ctx, 'Прибавить', { kind: 'plus', value: ctx.number(step.value, 'сколько прибавить') }),
};

const RUNNERS: Record<string, Runner> = {
  threshold, amount, compare, apply, status, emit, table, each,
  'roll-add': rollAdd, 'roll-reroll': rollReroll, 'roll-plus': rollPlus,
};

export function runnerOf(type: string): Runner {
  const runner = RUNNERS[type];
  if (!runner) throw new EngineError(`неизвестный тип шага «${type}» — знаю: ${Object.keys(RUNNERS).join(', ')}`);
  return runner;
}

export const onceStep = (step: StepData): boolean => runnerOf(step.type).once?.(step) ?? false;
