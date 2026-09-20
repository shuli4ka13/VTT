import { resolveRoll, claimedModifiers } from '../modifiers.ts';
import { lookupDegree } from '../tables.ts';
import { dieConstant, rollLead, unfoldDice } from '../lead-die.ts';
import { packRef, resolveNumber, resolveOptionalNumber } from '../refs.ts';
import { EngineError } from '../errors.ts';
import type { StepData, StepContext } from './index.ts';
import type { RolledDie } from '../readings.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';

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

function unfold(die: unknown, ctx: StepContext) {
  return unfoldDice(dieOf(ctx.system, die), (ref, what) => resolveNumber(ref, ctx, what));
}

const OUTCOMES: Record<string, (total: number, versus: number) => { success: boolean; margin: number }> = {
  atLeast: (total, versus) => ({ success: total >= versus, margin: total - versus }),
  notOver: (total, versus) => ({ success: total <= versus, margin: versus - total }),
  over: (total, versus) => ({ success: total > versus, margin: total - versus }),
  under: (total, versus) => ({ success: total < versus, margin: versus - total }),

  equals: (total, versus) => ({ success: total === versus, margin: -Math.abs(total - versus) }),
};

export const mayBreak = true;

export const icon = '⌖';

export function lint(step: StepData) {
  if (!step.roll || !step.roll.die || !step.roll.die.constant) {
    return 'порогу нужна кость — слот roll.die ссылается на константу системы';
  }
  return null;
}

export function traceLine(t: any, h: any) {
  const checkName = t.check ? ` «${h.labelOf(t.check)}»` : '';
  const versusName = t.versus.tag ? `${h.labelOf(t.versus.tag)} ` : '';

  const shown = Array.isArray(t.raw) && t.raw.length === t.rolls.length
    ? t.rolls.map((v: number, i: number) => (t.raw[i] === v ? String(v) : `${t.raw[i]}→${v}`)).join(', ')
    : t.rolls.join(', ');
  const dice = t.read === 'count' ? `[${shown}] → успехов ${t.total - t.bonus}`
    : t.kept != null && t.rolls.length > 1 ? `[${shown}] → ${t.kept}`
      : `[${shown}]`;
  const parts = t.parts && Object.keys(t.parts).length
    ? ' · ' + Object.entries(t.parts).map(([k, v]) => `${k}: ${v}`).join(', ')
    : '';

  const taken = t.success ? `взят (запас ${t.margin})` : `не взят (недобор ${-t.margin})`;
  const verdict = t.degree !== undefined && t.degree !== null
    ? `${taken}, степень ${t.degree}`
    : taken;

  const edits = t.edits?.length ? ` · ${t.edits.join(', ')}` : '';
  return `проверка${checkName}: ${dice} + ${t.bonus} = ${t.total} против ${versusName}${t.versus.value} — ${verdict}${edits}${parts}`;
}

export function pack(step: StepData, ctx: StepContext) {
  const roll = step.roll || {};
  if (!roll.die || !roll.die.constant) {
    throw new EngineError(
      `${ctx.owner || 'правило'}: порогу нужна кость — слот roll.die ссылается на константу системы, например { constant: 'lead_die' }`);
  }
  const base = {
    side: step.side || 'source',
    continueOn: step.continueOn || 'success',
    successWhen: step.successWhen || 'atLeast',
    versus: packRef(step.versus, ctx),

    ...(step.degrees && step.degrees.table ? { degrees: step.degrees } : {}),
  };

  if (base.side === 'target') {

    return { ...base, roll: { die: roll.die, bonus: packRef(roll.bonus, ctx), check: roll.check || null } };
  }

  const check = roll.check || null;
  const extra = [
    ...(ctx.against ? ctx.against(check) : []),
    ...claimedModifiers(ctx.system, ctx.claims ?? [], check),
  ];
  const mods = resolveRoll(ctx.system, ctx.sheet, check, ctx.pass, extra);
  const held = ctx.kept?.[String(step.id ?? '')]?.rolled?.entries as RolledDie[] | undefined;
  const rolled = rollLead(unfold(roll.die, ctx), ctx.die, mods.edits, held ?? []);
  return { ...base, check, rolled, bonus: packRef(roll.bonus, ctx), modBonus: mods.bonus };
}

export function resolve(step: StepData, ctx: StepContext) {
  let rolled = step.rolled;
  let modBonus = step.modBonus || 0;

  if (!rolled) {

    const check = step.roll.check || null;
    const mods = resolveRoll(
      ctx.system, ctx.sheet, check, ctx.pass, claimedModifiers(ctx.system, ctx.claims ?? [], check));
    rolled = rollLead(unfold(step.roll.die, ctx), ctx.die, mods.edits);
    modBonus = mods.bonus;
  }

  const bonusRef = step.rolled ? step.bonus : step.roll.bonus;
  const bonus = (resolveOptionalNumber(bonusRef, ctx, 'бонус порога') ?? 0) + modBonus;
  const total = rolled.total + bonus;

  const shift = rolled.versusShift || 0;
  const eased = (String(step.successWhen) === 'notOver' || String(step.successWhen) === 'under')
    ? -shift : shift;
  const versus = resolveNumber(step.versus, ctx, 'порогу не с чем сравнить бросок') + eased;
  const outcome = OUTCOMES[String(step.successWhen)] || OUTCOMES.atLeast!;
  const { success, margin } = outcome(total, versus);

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
  };

  const goOn = step.continueOn === 'always' ? true : step.continueOn === 'fail' ? !success : success;
  return {
    value,
    trace: {
      rolls: rolled.rolls, kept: rolled.kept, bonus, total,
      ...(rolled.raw && rolled.raw.some((v: number, i: number) => v !== rolled.rolls[i]) ? { raw: rolled.raw } : {}),

      ...(rolled.read && rolled.read !== 'sum' ? { read: rolled.read } : {}),
      ...(rolled.edits?.length ? { edits: rolled.edits } : {}),
      versus: step.versus && typeof step.versus === 'object' && 'tag' in step.versus
        ? { tag: step.versus.tag, value: versus }
        : { value: versus },
      margin, success,
      ...(scale ? { degree } : {}),
      ...(Object.keys(rolled.parts || {}).length ? { parts: rolled.parts } : {}),
    },
    break: goOn ? null : {
      reason: step.continueOn === 'fail' ? 'threshold-held' : 'threshold-miss',
    },
  };
}
