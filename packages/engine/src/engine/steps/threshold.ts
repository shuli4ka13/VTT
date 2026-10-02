import { EngineError } from '../errors.ts';
import { dieConstant } from '../lead-die.ts';
import { lookupDegree } from '../tables.ts';
import { lonelyField } from '../refs.ts';
import { parse, withCount } from '../../core/dice.ts';
import type { RollResult, Spec } from '../../core/dice.ts';
import type { Thrown } from '../../core/roll.ts';
import type { StepData, StepContext, StepModule } from './index.ts';
import { STEP_WORDS, forcedWords, type StepWords } from '../../words/steps.ts';

export const type = 'threshold';
const words: StepWords = STEP_WORDS.threshold;
export const { label, hint, slots, outputs } = words;

export function breakLine(step: StepData) {
  const mode = String(step.continueOn || 'success');
  return words.breakLines[mode] ?? null;
}

export function reasonWord(reason: string): string | null {
  return words.reasons[reason] ?? null;
}

const who = (ctx: StepContext): string => ctx.owner || 'правило';

const LITERAL = /^(\d+)?\s*[dдк]\s*(\d+)$/iu;

function specOf(ctx: StepContext, die: unknown, count: unknown): Spec {
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

function tagsOf(raw: unknown, ctx: StepContext): string[] {
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

const runner: Pick<StepModule, 'once' | 'mayBreak' | 'prepare' | 'finish'> = {
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
    const successWhen = OUTCOMES[String(step.successWhen)] ? String(step.successWhen) : 'atLeast';
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

function versusOf(versus: unknown, side: string, ctx: StepContext): { value: number; against?: Record<string, any> } {
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


export const { once, mayBreak, prepare, finish } = runner;

export const icon = '⌖';

export function lint(step: StepData) {
  if (!step.roll || !step.roll.die || !step.roll.die.constant) {
    return 'порогу нужна кость — слот roll.die ссылается на константу системы';
  }
  const opposed = opposedOf(step.versus);
  if (opposed && !(opposed.die && typeof opposed.die === 'object')) {
    return 'встречному броску нужна кость';
  }
  return null;
}

export function traceLine(t: any, h: any) {
  const checkName = t.tags?.length ? ` «${t.tags.join(', ')}»` : '';
  const versusName = t.versus.tag ? `${h.labelOf(t.versus.tag)} ` : '';
  const opposed = t.against
    ? `встречного броска${t.against.tags?.length ? ` «${t.against.tags.join(', ')}»` : ''} [${t.against.rolls.join(', ')}]${
      t.against.read === 'count' ? ` → успехов ${t.against.natural}` : ''} + ${t.against.bonus} = `
    : '';

  const shown = Array.isArray(t.raw) && t.raw.length === t.rolls.length
    ? t.rolls.map((v: number, i: number) => (t.raw[i] === v ? String(v) : `${t.raw[i]}→${v}`)).join(', ')
    : t.rolls.join(', ');
  const dice = t.read === 'count' ? `[${shown}] → успехов ${t.total - t.bonus}`
    : t.kept != null && t.rolls.length > 1 ? `[${shown}] → ${t.kept}`
      : `[${shown}]`;
  const parts = t.parts && Object.keys(t.parts).length
    ? ' · ' + Object.entries(t.parts).map(([k, v]) => `${k}: ${v}`).join(', ')
    : '';

  const taken = t.forced != null ? `${t.success ? 'взят' : 'не взят'} (${forcedWords(t.forced, t.success)})`
    : t.success ? `взят (запас ${t.margin})` : `не взят (недобор ${-t.margin})`;
  const verdict = t.degree !== undefined && t.degree !== null
    ? `${taken}, степень ${t.degree}`
    : taken;

  const edits = t.edits?.length ? ` · ${t.edits.join(', ')}` : '';
  return `проверка${checkName}: ${dice} + ${t.bonus} = ${t.total} против ${opposed}${versusName}${t.versus.value} — ${verdict}${edits}${parts}`;
}

