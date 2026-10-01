import { resolveRoll, claimedModifiers } from '../modifiers.ts';
import { lookupDegree } from '../tables.ts';
import { dieConstant, rollLead, unfoldDice, withCount } from '../lead-die.ts';
import { packRef, resolveRef, resolveNumber, resolveOptionalNumber, lonelyField } from '../refs.ts';
import { EngineError } from '../errors.ts';
import type { StepData, StepContext } from './index.ts';
import type { RolledDie } from '../readings.ts';
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

const LITERAL = /^(\d+)?\s*[dдк]\s*(\d+)$/iu;

function dieOf(system: Parameters<typeof dieConstant>[0], die: unknown) {
  if (die && typeof die === 'object' && 'const' in (die as object)) {
    const text = String((die as { const: unknown }).const ?? '');
    const m = text.trim().match(LITERAL);
    if (!m) {
      throw new EngineError(`«${text}» — не запись кости; жду вроде «1к20» или «2к6»`);
    }
    return { label: text, kind: 'die' as const, dice: [{ count: Number(m[1] ?? 1), sides: Number(m[2]) }] };
  }
  return dieConstant(system, (die as { constant: string }).constant);
}

const tagList = (tags: unknown): unknown[] => (Array.isArray(tags) ? tags : []);

const packTags = (tags: unknown, ctx: StepContext): unknown[] =>
  tagList(tags).map(tag => (typeof tag === 'string' ? tag : packRef(tag, ctx)));

function tagsHere(tags: unknown, ctx: StepContext): string[] {
  return [...new Set(tagList(tags).flatMap(tag => {
    if (typeof tag === 'string') return [tag];
    const value = resolveRef(tag, ctx);
    if (Array.isArray(value)) return value.map(String);
    return value === null || value === undefined || value === '' ? [] : [String(value)];
  }))];
}

function unfold(die: unknown, ctx: StepContext, count?: unknown, packed = false) {
  const resolver = (ref: unknown, what: string) => resolveNumber(packRef(ref, ctx), ctx, what);
  const many = count === undefined || count === null ? undefined
    : resolveNumber(packed ? count : packRef(count, ctx), ctx, 'сколько костей');
  return unfoldDice(withCount(dieOf(ctx.system, die), many, ctx.owner || 'проверка'), resolver);
}

const OUTCOMES: Record<string, (total: number, versus: number) => { success: boolean; margin: number }> = {
  atLeast: (total, versus) => ({ success: total >= versus, margin: total - versus }),
  notOver: (total, versus) => ({ success: total <= versus, margin: versus - total }),
  over: (total, versus) => ({ success: total > versus, margin: total - versus }),
  under: (total, versus) => ({ success: total < versus, margin: versus - total }),

  equals: (total, versus) => ({ success: total === versus, margin: -Math.abs(total - versus) }),
};

export const once = (step: StepData): boolean => (step.side || 'sender') !== 'target';

export const mayBreak = true;

export const icon = '⌖';

type RollSpec = { die?: unknown; count?: unknown; bonus?: unknown; tags?: unknown[] };

const opposedOf = (versus: unknown): RollSpec | null =>
  (versus && typeof versus === 'object' && 'roll' in (versus as object) ? (versus as { roll: RollSpec }).roll : null);

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

function rollHere(spec: RollSpec, ctx: StepContext, packed = false) {
  const tags = tagsHere(packed ? spec.tags : packTags(spec.tags, ctx), ctx);
  const mods = resolveRoll(
    ctx.system, ctx.sheet, tags, ctx.pass,
    claimedModifiers(ctx.system, ctx.claims ?? []) as never);
  const rolled = rollLead(unfold(spec.die, ctx, spec.count, packed), ctx.die, mods.edits);
  return { rolled, modBonus: mods.bonus, tags };
}

function packVersus(versus: unknown, rollerSide: string, ctx: StepContext): unknown {
  const opposed = opposedOf(versus);
  if (!opposed) return packRef(versus, ctx);
  if (rollerSide === 'target') {
    const { rolled, modBonus, tags } = rollHere(opposed, ctx);
    return { rolled, bonus: packRef(opposed.bonus, ctx), modBonus, tags };
  }
  return { roll: { die: opposed.die, ...countPacked(opposed.count, ctx), bonus: packRef(opposed.bonus, ctx), tags: packTags(opposed.tags, ctx) } };
}

function versusOf(packed: any, ctx: StepContext): { value: number; against?: Record<string, unknown> } {
  if (packed && typeof packed === 'object' && ('rolled' in packed || 'roll' in packed)) {
    const here = 'rolled' in packed
      ? { rolled: packed.rolled, modBonus: packed.modBonus || 0, tags: (packed.tags ?? []) as string[] }
      : rollHere(packed.roll, ctx, true);
    const bonusRef = 'rolled' in packed ? packed.bonus : packed.roll.bonus;
    const bonus = (resolveOptionalNumber(bonusRef, ctx, 'прибавка встречного броска') ?? 0) + here.modBonus;
    const total = here.rolled.total + bonus;
    return {
      value: total,
      against: {
        natural: here.rolled.total, total, bonus, rolls: here.rolled.rolls, kept: here.rolled.kept,
        ...(here.rolled.read && here.rolled.read !== 'sum' ? { read: here.rolled.read } : {}),
        ...(here.tags.length ? { tags: here.tags } : {}),
      },
    };
  }
  return { value: resolveNumber(packed, ctx, 'порогу не с чем сравнить бросок') };
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

const countPacked = (count: unknown, ctx: StepContext): { count?: unknown } =>
  (count === undefined || count === null ? {} : { count: packRef(count, ctx) });

export function pack(step: StepData, ctx: StepContext) {
  const roll = step.roll || {};
  if (!roll.die || !roll.die.constant) {
    throw new EngineError(
      `${ctx.owner || 'правило'}: порогу нужна кость — слот roll.die ссылается на константу системы, например { constant: 'lead_die' }`);
  }
  const base = {
    side: step.side || 'sender',
    continueOn: step.continueOn || 'success',
    successWhen: step.successWhen || 'atLeast',
    versus: packVersus(step.versus, step.side || 'sender', ctx),
    ...(lonelyField(step.versus, ctx.system) ? { against: lonelyField(step.versus, ctx.system) } : {}),

    ...(step.degrees && step.degrees.table ? { degrees: step.degrees } : {}),
    ...(step.succeedOn !== undefined && step.succeedOn !== null ? { succeedOn: packRef(step.succeedOn, ctx) } : {}),
    ...(step.failOn !== undefined && step.failOn !== null ? { failOn: packRef(step.failOn, ctx) } : {}),
  };

  if (base.side === 'target') {

    return { ...base, roll: { die: roll.die, ...countPacked(roll.count, ctx), bonus: packRef(roll.bonus, ctx), tags: packTags(roll.tags, ctx) } };
  }

  const tags = tagsHere(packTags(roll.tags, ctx), ctx);
  const extra = [
    ...(ctx.against ? ctx.against(tags) : []),
    ...claimedModifiers(ctx.system, ctx.claims ?? []),
  ];
  const mods = resolveRoll(ctx.system, ctx.sheet, tags, ctx.pass, extra);
  const held = ctx.kept?.[String(step.id ?? '')]?.rolled?.entries as RolledDie[] | undefined;
  const rolled = rollLead(unfold(roll.die, ctx, roll.count), ctx.die, mods.edits, held ?? []);
  return { ...base, tags, rolled, bonus: packRef(roll.bonus, ctx), modBonus: mods.bonus };
}

export function resolve(step: StepData, ctx: StepContext) {
  let rolled = step.rolled;
  let modBonus = step.modBonus || 0;
  let tags: string[] = (step.tags ?? []) as string[];

  if (!rolled) {
    tags = tagsHere(step.roll.tags, ctx);
    const mods = resolveRoll(
      ctx.system, ctx.sheet, tags, ctx.pass,
      claimedModifiers(ctx.system, ctx.claims ?? []));
    rolled = rollLead(unfold(step.roll.die, ctx, step.roll.count, true), ctx.die, mods.edits);
    modBonus = mods.bonus;
  }

  const bonusRef = step.rolled ? step.bonus : step.roll.bonus;
  const bonus = (resolveOptionalNumber(bonusRef, ctx, 'бонус порога') ?? 0) + modBonus;
  const total = rolled.total + bonus;

  const shift = rolled.versusShift || 0;
  const eased = (String(step.successWhen) === 'notOver' || String(step.successWhen) === 'under')
    ? -shift : shift;
  const against = versusOf(step.versus, ctx);
  const versus = against.value + eased;
  const outcome = OUTCOMES[String(step.successWhen)] || OUTCOMES.atLeast!;
  const judged = outcome(total, versus);
  const margin = judged.margin;
  const succeedOn = resolveOptionalNumber(step.succeedOn, ctx, 'кость верного успеха');
  const failOn = resolveOptionalNumber(step.failOn, ctx, 'кость верного провала');
  const forced = failOn !== null && rolled.total <= failOn ? false
    : succeedOn !== null && rolled.total >= succeedOn ? true : null;
  const success = forced ?? judged.success;

  const scale = step.degrees && step.degrees.table ? step.degrees : null;
  const degree = scale
    ? lookupDegree(
      ctx.system, scale.table,
      scale.of === 'margin' ? margin : total,
      rolled.degreeShift || 0, ctx.owner)
    : null;

  const value = {
    success, margin, total,
    natural: rolled.total,
    rolled: rolled.tally?.dice ?? rolled.rolls.length,
    atMax: rolled.tally?.atMax ?? 0,
    atMin: rolled.tally?.atMin ?? 0,
    edited: (rolled.edits?.length ?? 0) > 0,
    ...(scale ? { degree } : {}),
    dice: { rolls: rolled.rolls, kept: rolled.kept },
    parts: rolled.parts || {},
    versus,
    ...(against.against ? { against: against.against, versusNatural: against.against.natural } : {}),
  };

  const goOn = step.continueOn === 'always' ? true : step.continueOn === 'fail' ? !success : success;
  return {
    value,
    trace: {
      rolls: rolled.rolls, kept: rolled.kept, bonus, total,
      ...(tags.length ? { tags } : {}),
      ...(rolled.raw && rolled.raw.some((v: number, i: number) => v !== rolled.rolls[i]) ? { raw: rolled.raw } : {}),

      ...(rolled.read && rolled.read !== 'sum' ? { read: rolled.read } : {}),
      ...(rolled.edits?.length ? { edits: rolled.edits } : {}),
      versus: step.against ? { tag: step.against, value: versus } : { value: versus },
      margin, success,
      ...(forced !== null ? { forced: rolled.total } : {}),
      ...(against.against ? { against: against.against } : {}),
      ...(scale ? { degree } : {}),
      ...(Object.keys(rolled.parts || {}).length ? { parts: rolled.parts } : {}),
    },
    break: goOn ? null : {
      reason: step.continueOn === 'fail' ? 'threshold-held' : 'threshold-miss',
    },
  };
}
