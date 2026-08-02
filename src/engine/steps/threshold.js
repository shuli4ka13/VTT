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

import { resolveRoll } from '../modifiers.js';
import { dieConstant, rollLead } from '../lead-die.js';
import { packRef, resolveNumber, resolveOptionalNumber } from '../refs.js';
import { EngineError } from '../errors.js';

export const type = 'threshold';
export const label = 'Порог';
export const hint = 'Бросок против величины. Не вышло — цепочка обрывается.';

export const slots = [
  { key: 'side', label: 'Кто бросает', kind: 'choice', options: ['sender', 'target'] },
  { key: 'roll', label: 'Бросок', kind: 'roll' },
  { key: 'versus', label: 'Против', kind: 'ref' },
  { key: 'continueOn', label: 'Дальше при', kind: 'choice', options: ['success', 'fail'] },
];

// Чем шаг делится с последующими — конструктор строит из этого выпадашку
// допустимых ссылок, не зная типа.
export const outputs = [
  { path: '.margin', label: 'превышение' },
  { path: '.total', label: 'итог броска' },
];

// Может оборвать цепочку — приговор о разборе говорит об этом словами.
export const mayBreak = true;

export function lint(step) {
  if (!step.roll || !step.roll.die || !step.roll.die.constant) {
    return 'порогу нужна кость — слот roll.die ссылается на константу системы';
  }
  return null;
}

// Строка журнала. Живёт в модуле шага: новый тип приносит свою подачу сам,
// интерфейс не ветвится по типам.
export function traceLine(t, h) {
  const versusName = t.versus.tag ? `${h.labelOf(t.versus.tag)} ` : '';
  const dice = t.rolls.length > 1 ? `[${t.rolls.join(', ')}] → ${t.kept}` : `[${t.rolls[0]}]`;
  const parts = t.parts && Object.keys(t.parts).length
    ? ' · ' + Object.entries(t.parts).map(([k, v]) => `${k}: ${v}`).join(', ')
    : '';
  const verdict = t.success ? `взят (запас ${t.margin})` : `не взят (недобор ${-t.margin})`;
  return `порог: ${dice} + ${t.bonus} = ${t.total} против ${versusName}${t.versus.value} — ${verdict}${parts}`;
}

export function pack(step, ctx) {
  const roll = step.roll || {};
  if (!roll.die || !roll.die.constant) {
    throw new EngineError(
      `${ctx.owner || 'правило'}: порогу нужна кость — слот roll.die ссылается на константу системы, например { constant: 'lead_die' }`);
  }
  const base = {
    side: step.side || 'sender',
    continueOn: step.continueOn || 'success',
    versus: packRef(step.versus, ctx),
  };

  if (base.side === 'target') {
    // Бросок цели уезжает рецептом: кость разрешится по системе ПОЛУЧАТЕЛЯ.
    return { ...base, roll: { die: roll.die, bonus: packRef(roll.bonus, ctx), check: roll.check || null } };
  }

  const mods = roll.check
    ? resolveRoll(ctx.system, ctx.sheet, roll.check, ctx.pass)
    : { mode: 'normal', bonus: 0 };
  const rolled = rollLead(dieConstant(ctx.system, roll.die.constant), ctx.die, mods.mode);
  return { ...base, rolled, bonus: packRef(roll.bonus, ctx), modBonus: mods.bonus };
}

export function resolve(step, ctx) {
  let rolled = step.rolled;
  let modBonus = step.modBonus || 0;

  if (!rolled) {
    // Порог на стороне цели: бросаем здесь и сейчас, её костью и модификаторами.
    const mods = step.roll.check
      ? resolveRoll(ctx.system, ctx.sheet, step.roll.check, ctx.pass)
      : { mode: 'normal', bonus: 0 };
    rolled = rollLead(dieConstant(ctx.system, step.roll.die.constant), ctx.die, mods.mode);
    modBonus = mods.bonus;
  }

  const bonusRef = step.rolled ? step.bonus : step.roll.bonus;
  const bonus = (resolveOptionalNumber(bonusRef, ctx, 'бонус порога') ?? 0) + modBonus;
  const total = rolled.total + bonus;

  const versus = resolveNumber(step.versus, ctx, 'порогу не с чем сравнить бросок');
  const margin = total - versus;
  const success = total >= versus;

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
