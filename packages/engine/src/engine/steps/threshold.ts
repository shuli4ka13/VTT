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
import { lookupDegree } from '../tables.ts';
import { dieConstant, rollLead, unfoldDice } from '../lead-die.ts';
import { packRef, resolveNumber, resolveOptionalNumber } from '../refs.ts';
import { EngineError } from '../errors.ts';
import type { StepData, StepContext } from './index.ts';

export const type = 'threshold';
export const label = 'Порог';
export const hint = 'Бросок против величины. Не вышло — цепочка обрывается.';

export const slots = [
  { key: 'side', label: 'Кто бросает', kind: 'choice', options: ['sender', 'target'] },
  { key: 'roll', label: 'Бросок', kind: 'roll' },
  { key: 'versus', label: 'Против', kind: 'ref' },
  {
    key: 'successWhen', label: 'Успех, если бросок',
    kind: 'choice', options: ['atLeast', 'notOver', 'over', 'under', 'equals'],
  },
  { key: 'continueOn', label: 'Дальше при', kind: 'choice', options: ['success', 'fail'] },
  // Степени успеха: миру PbtA и PF2e мало «да/нет». Шкала — обычная таблица
  // по диапазонам из словаря, читается либо по итогу броска (2d6: 6−/7–9/10+),
  // либо по запасу против порога (PF2e: ±10 от сложности).
  { key: 'degrees', label: 'Степени успеха', kind: 'degrees' },
];

// Направление сравнения — свойство системы, не движка: 5e бросает d20 «вверх»
// (не меньше порога, равенство — успех), CoC/GURPS — «вниз» (d100/3d6 не выше
// навыка), а где-то равенство — провал. margin — всегда «запас бросающего»,
// положителен при успехе, независимо от направления.
// Кость шага: ссылка на константу системы ({ constant }) — обычный путь,
// смена ведущей кости меняет все броски разом; либо литерал ({ const: '2d6' })
// — для проверок, которым системной кости мало. Литерал разбирается на месте.
const LITERAL = /^(\d+)?\s*[dдк]\s*(\d+)$/iu;

function dieOf(system: Parameters<typeof dieConstant>[0], die: unknown) {
  if (die && typeof die === 'object' && 'const' in (die as object)) {
    const text = String((die as { const: unknown }).const ?? '');
    const m = text.trim().match(LITERAL);
    if (!m) {
      throw new EngineError(`«${text}» — не запись кости; жду вроде «1d20» или «2к6»`);
    }
    return { label: text, kind: 'die' as const, dice: [{ count: Number(m[1] ?? 1), sides: Number(m[2]) }] };
  }
  return dieConstant(system, (die as { constant: string }).constant);
}

// Счёт костей в составе может быть ссылкой (пул из листа) — разворачиваем
// контекстом той стороны, которая бросает: пул цели считается её листом.
function unfold(die: unknown, ctx: StepContext) {
  return unfoldDice(dieOf(ctx.system, die), (ref, what) => resolveNumber(ref, ctx, what));
}

const OUTCOMES: Record<string, (total: number, versus: number) => { success: boolean; margin: number }> = {
  atLeast: (total, versus) => ({ success: total >= versus, margin: total - versus }),
  notOver: (total, versus) => ({ success: total <= versus, margin: versus - total }),
  over: (total, versus) => ({ success: total > versus, margin: total - versus }),
  under: (total, versus) => ({ success: total < versus, margin: versus - total }),
  // Точное попадание: успех — ровно в цель; запас — недолёт/перелёт, всегда ≤ 0.
  equals: (total, versus) => ({ success: total === versus, margin: -Math.abs(total - versus) }),
};

// Чем шаг делится с последующими — конструктор строит из этого выпадашку
// допустимых ссылок, не зная типа.
export const outputs = [
  // Логический выход стоит первым: на него смотрит условие триггера, а оно
  // требует именно «да/нет» — число условием быть не может.
  { path: '.success', label: 'вышло', kind: 'boolean' },
  { path: '.margin', label: 'превышение', kind: 'number' },
  { path: '.total', label: 'итог броска', kind: 'number' },
  { path: '.degree', label: 'степень успеха', kind: 'text' },
  // Счёт по НАТУРАЛЬНО выпавшему. Отсюда собираются криты и глитчи, и
  // собирает их автор: «две шестёрки» в Blades, «дубль» в Daggerheart,
  // «натуральная 20» в 5e — это условие на этих числах, а не понятие движка.
  // Доменных слов «крит» и «провал» здесь нет и быть не может.
  { path: '.rolled', label: 'сколько костей кинуто', kind: 'number' },
  { path: '.atMax', label: 'костей на максимуме', kind: 'number' },
  { path: '.atMin', label: 'костей на единице', kind: 'number' },
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

// Почему конвейер кончился здесь — человеческими словами. Код обрыва
// («threshold-miss») внятен движку, но в журнале за столом его читает
// игрок, поэтому перевод даёт сам шаг: он один знает, что значит его код.
export function reasonWord(reason: string): string | null {
  return reason === 'threshold-miss' ? 'промах'
    : reason === 'threshold-held' ? 'цель устояла'
      : null;
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
  const checkName = t.check ? ` «${h.labelOf(t.check)}»` : '';
  const versusName = t.versus.tag ? `${h.labelOf(t.versus.tag)} ` : '';
  // Кости пишутся по чтению: счёт успехов — счётом, выбор одной — стрелкой,
  // сумма нескольких (составной бросок) — просто списком, без «→ null».
  const dice = t.read === 'count' ? `[${t.rolls.join(', ')}] → успехов ${t.total - t.bonus}`
    : t.kept != null && t.rolls.length > 1 ? `[${t.rolls.join(', ')}] → ${t.kept}`
      : `[${t.rolls.join(', ')}]`;
  const parts = t.parts && Object.keys(t.parts).length
    ? ' · ' + Object.entries(t.parts).map(([k, v]) => `${k}: ${v}`).join(', ')
    : '';
  // Степень названа словом автора и вытесняет «взят/не взят»: в мире со
  // степенями «частичный успех» — и есть исход, а не оттенок к нему.
  const verdict = t.degree !== undefined && t.degree !== null
    ? `${t.degree} (запас ${t.margin})`
    : t.success ? `взят (запас ${t.margin})` : `не взят (недобор ${-t.margin})`;
  // Правки названы именами АВТОРА: в журнале за столом игрок читает
  // «Преимущество», а не «addDie + keepBest».
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
    side: step.side || 'sender',
    continueOn: step.continueOn || 'success',
    successWhen: step.successWhen || 'atLeast',
    versus: packRef(step.versus, ctx),
    // Шкала степеней уезжает В КОНВЕРТЕ: читать её будет получатель, и по
    // СВОЕЙ таблице — как и всё остальное, что он считает за себя.
    ...(step.degrees && step.degrees.table ? { degrees: step.degrees } : {}),
  };

  if (base.side === 'target') {
    // Бросок цели уезжает рецептом: кость разрешится по системе ПОЛУЧАТЕЛЯ.
    return { ...base, roll: { die: roll.die, bonus: packRef(roll.bonus, ctx), check: roll.check || null } };
  }

  const mods = resolveRoll(ctx.system, ctx.sheet, roll.check || null, ctx.pass);
  const rolled = rollLead(unfold(roll.die, ctx), ctx.die, mods.edits);
  return { ...base, rolled, bonus: packRef(roll.bonus, ctx), modBonus: mods.bonus };
}

export function resolve(step: StepData, ctx: StepContext) {
  let rolled = step.rolled;
  let modBonus = step.modBonus || 0;

  if (!rolled) {
    // Порог на стороне цели: бросаем здесь и сейчас, её костью и модификаторами.
    const mods = resolveRoll(ctx.system, ctx.sheet, step.roll.check || null, ctx.pass);
    rolled = rollLead(unfold(step.roll.die, ctx), ctx.die, mods.edits);
    modBonus = mods.bonus;
  }

  const bonusRef = step.rolled ? step.bonus : step.roll.bonus;
  const bonus = (resolveOptionalNumber(bonusRef, ctx, 'бонус порога') ?? 0) + modBonus;
  const total = rolled.total + bonus;

  // Сдвиг порога — тоже правка броска (GURPS, PF2e): её принесла заявка,
  // а применить может только сравнивающий. Знак — «в пользу бросающего»
  // независимо от направления: −2 к сложности и в мире «не выше навыка»
  // делает бросок легче.
  const shift = rolled.versusShift || 0;
  const eased = (String(step.successWhen) === 'notOver' || String(step.successWhen) === 'under')
    ? -shift : shift;
  const versus = resolveNumber(step.versus, ctx, 'порогу не с чем сравнить бросок') + eased;
  const outcome = OUTCOMES[String(step.successWhen)] || OUTCOMES.atLeast!;
  const { success, margin } = outcome(total, versus);

  // Степень: та же шкала, сдвинутая правками («сдвинуть степень» PF2e и PbtA).
  // Считается только если мир её объявил — иначе исход остаётся «да/нет».
  const scale = step.degrees && step.degrees.table ? step.degrees : null;
  const degree = scale
    ? lookupDegree(
      ctx.system, scale.table,
      scale.of === 'margin' ? margin : total,
      rolled.degreeShift || 0, ctx.owner)
    : null;

  const value = {
    success, margin, total,
    rolled: rolled.tally?.dice ?? rolled.rolls.length,
    atMax: rolled.tally?.atMax ?? 0,
    atMin: rolled.tally?.atMin ?? 0,
    ...(scale ? { degree } : {}),
    dice: { rolls: rolled.rolls, kept: rolled.kept },
    parts: rolled.parts || {},
  };

  const goOn = step.continueOn === 'fail' ? !success : success;
  return {
    value,
    trace: {
      rolls: rolled.rolls, kept: rolled.kept, bonus, total,
      // Чтение и правки пишутся только небанальные: чистый бросок в старом
      // мире даёт ту же трассу, что и раньше.
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
