// Шаг «порог»: бросок против величины. При исходе «не туда» цепочка обрывается.
//
// Возвращает структуру, а не флаг: { success, margin, total, dice, parts } —
// превышение и сами кости нужны следующим шагам (урон из превышения, крит
// по кубу, Надежда/Страх составной кости).
//
// Слот side решает, ЧЬЯ это проверка:
//   'sender' (умолчание) — атака: бросает отправитель при упаковке;
//   'target'             — спасбросок: бросает ПОЛУЧАТЕЛЬ своей ведущей костью,
//                          своими формулами и своими модификаторами броска.
//                          Никакого специального типа «спасбросок» нет.
//
// Слот continueOn решает, какой исход продолжает цепочку: 'success' (атака —
// дальше только при попадании) или 'fail' (спасбросок — дальше только если
// цель НЕ спаслась). Обрывы различимы в журнале: threshold-miss против
// threshold-held.

import { resolveRoll } from '../modifiers.ts';
import { dieConstant, rollLead } from '../lead-die.ts';
import { packRef, resolveNumber, resolveOptionalNumber } from '../refs.ts';
import { EngineError } from '../errors.ts';
import type { StepData, StepContext } from './index.ts';
import type { RollMode } from '../dice.ts';

export const type = 'threshold';
export const label = 'Порог';
export const hint = 'Бросок против величины. Не вышло — цепочка обрывается.';

export const slots = [
  { key: 'side', label: 'Кто бросает', kind: 'choice', options: ['sender', 'target'] },
  { key: 'roll', label: 'Бросок', kind: 'roll' },
  { key: 'versus', label: 'Против', kind: 'ref' },
  {
    key: 'successWhen', label: 'Успех, если бросок',
    kind: 'choice', options: ['atLeast', 'notOver', 'over', 'under'],
  },
  { key: 'continueOn', label: 'Дальше при', kind: 'choice', options: ['success', 'fail'] },
];

// Направление сравнения — свойство системы, не движка: 5e бросает d20 «вверх»
// (не меньше порога, равенство — успех), CoC/GURPS — «вниз» (d100/3d6 не выше
// навыка), а где-то равенство — провал. margin — всегда «запас бросающего»,
// положителен при успехе, независимо от направления.
const OUTCOMES: Record<string, (total: number, versus: number) => { success: boolean; margin: number }> = {
  atLeast: (total, versus) => ({ success: total >= versus, margin: total - versus }),
  notOver: (total, versus) => ({ success: total <= versus, margin: versus - total }),
  over: (total, versus) => ({ success: total > versus, margin: total - versus }),
  under: (total, versus) => ({ success: total < versus, margin: versus - total }),
};

// Чем шаг делится с последующими — конструктор строит из этого выпадашку
// допустимых ссылок, не зная типа.
export const outputs = [
  { path: '.margin', label: 'превышение' },
  { path: '.total', label: 'итог броска' },
];

// Может оборвать цепочку — приговор о разборе говорит об этом словами.
export const mayBreak = true;

// Подпись развилки на хребте конвейера: КОГДА правило кончается на этом шаге.
// «Промах» и «цель устояла» — разные истории, конструктор рисует слова шага,
// а не общее «может оборвать».
export function breakLine(step: StepData) {
  return (step.continueOn || 'success') === 'fail'
    ? 'если порог взят — цель устояла'
    : 'если порог не взят — промах';
}

export const icon = '⌖';

export function lint(step: StepData) {
  if (!step.roll || !step.roll.die || !step.roll.die.constant) {
    return 'порогу нужна кость — слот roll.die ссылается на константу системы';
  }
  return null;
}

// Строка журнала. Живёт в модуле шага: новый тип приносит свою подачу сам,
// интерфейс не ветвится по типам.
export function traceLine(t: any, h: any) {
  const versusName = t.versus.tag ? `${h.labelOf(t.versus.tag)} ` : '';
  const dice = t.rolls.length > 1 ? `[${t.rolls.join(', ')}] → ${t.kept}` : `[${t.rolls[0]}]`;
  const parts = t.parts && Object.keys(t.parts).length
    ? ' · ' + Object.entries(t.parts).map(([k, v]) => `${k}: ${v}`).join(', ')
    : '';
  const verdict = t.success ? `взят (запас ${t.margin})` : `не взят (недобор ${-t.margin})`;
  return `порог: ${dice} + ${t.bonus} = ${t.total} против ${versusName}${t.versus.value} — ${verdict}${parts}`;
}

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
    versus: packRef(step.versus, ctx),
  };

  if (base.side === 'target') {
    // Бросок цели уезжает рецептом: кость разрешится по системе ПОЛУЧАТЕЛЯ.
    return { ...base, roll: { die: roll.die, bonus: packRef(roll.bonus, ctx), check: roll.check || null } };
  }

  const mods = roll.check
    ? resolveRoll(ctx.system, ctx.sheet, roll.check, ctx.pass)
    : { mode: 'normal' as RollMode, bonus: 0 };
  const rolled = rollLead(dieConstant(ctx.system, roll.die.constant), ctx.die, mods.mode);
  return { ...base, rolled, bonus: packRef(roll.bonus, ctx), modBonus: mods.bonus };
}

export function resolve(step: StepData, ctx: StepContext) {
  let rolled = step.rolled;
  let modBonus = step.modBonus || 0;

  if (!rolled) {
    // Порог на стороне цели: бросаем здесь и сейчас, её костью и модификаторами.
    const mods = step.roll.check
      ? resolveRoll(ctx.system, ctx.sheet, step.roll.check, ctx.pass)
      : { mode: 'normal' as RollMode, bonus: 0 };
    rolled = rollLead(dieConstant(ctx.system, step.roll.die.constant), ctx.die, mods.mode);
    modBonus = mods.bonus;
  }

  const bonusRef = step.rolled ? step.bonus : step.roll.bonus;
  const bonus = (resolveOptionalNumber(bonusRef, ctx, 'бонус порога') ?? 0) + modBonus;
  const total = rolled.total + bonus;

  const versus = resolveNumber(step.versus, ctx, 'порогу не с чем сравнить бросок');
  const outcome = OUTCOMES[String(step.successWhen)] || OUTCOMES.atLeast!;
  const { success, margin } = outcome(total, versus);

  const value = {
    success, margin, total,
    dice: { rolls: rolled.rolls, kept: rolled.kept },
    parts: rolled.parts || {},
  };

  const goOn = step.continueOn === 'fail' ? !success : success;
  return {
    value,
    trace: {
      rolls: rolled.rolls, kept: rolled.kept, mode: rolled.mode, bonus, total,
      versus: step.versus && typeof step.versus === 'object' && 'tag' in step.versus
        ? { tag: step.versus.tag, value: versus }
        : { value: versus },
      margin, success,
      ...(Object.keys(rolled.parts || {}).length ? { parts: rolled.parts } : {}),
    },
    break: goOn ? null : {
      reason: step.continueOn === 'fail' ? 'threshold-held' : 'threshold-miss',
    },
  };
}
