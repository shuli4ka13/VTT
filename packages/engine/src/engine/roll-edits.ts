// Правки броска: что запись словаря делает с ЗАЯВКОЙ и с выпавшими костями.
//
// Бросок — конвейер (спека «Что такое бросок»): состав → правки заявки →
// кости на руках → правки результата → чтение → сравнение. Здесь живут
// два этапа правок, и ни один примитив не знает доменных слов: «преимущество»
// называет автор в словаре, а движок складывает «добавить кость» и
// «оставить лучшую».
//
// Реестр по образцу engine/steps и engine/readings: новый примитив — модуль
// плюс строка здесь, ядро не правится.

import { EngineError } from './errors.ts';
import { readingOf } from './readings.ts';
import type { ReadSpec, RolledDie } from './readings.ts';
import type { DieConstant, DiceTerm, RollEdit, RollEditOp, Die } from '../model/types.ts';

/** Отбор костей: сколько оставить, с какого конца и — если бросок составной —
 * среди какой его части. Список, а не одна запись: «оставить лучшую Надежду»
 * и «оставить худший Страх» могут прийти от разных правок и не мешать друг другу. */
export interface KeepSpec { n: number; from: 'best' | 'worst'; part?: string }

/** Заявка: что собираются бросить, ещё не бросив. */
export interface RollClaim {
  dice: DiceTerm[];
  read: ReadSpec;
  /** Отборы по порядку. Пусто — читаются все кости. */
  keeps: KeepSpec[];
  /** Сдвиг порога: ±2 к сложности в GURPS и PF2e — правка броска, не поля. */
  versusShift: number;
  /** Сдвиг степени успеха на N ступеней: PF2e, PbtA. Применяет сравнивающий. */
  degreeShift: number;
}

interface ClaimPrimitive {
  stage: 'claim';
  label: string;
  apply(claim: RollClaim, op: RollEditOp): RollClaim;
}

interface ResultPrimitive {
  stage: 'result';
  label: string;
  apply(dice: RolledDie[], op: RollEditOp, die: Die): RolledDie[];
}

const num = (raw: unknown, fallback: number) => {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) ? n : fallback;
};

// Лестница величин кости. Savage Worlds ходит по к4–к12, DCC — по своей
// (к16, к24), поэтому лестница — параметр правки, а не константа движка.
const LADDER = [4, 6, 8, 10, 12, 20];

/**
 * Часть составного броска, которой адресована правка. Пусто — весь бросок.
 * Отсюда «бонусная кость десятков» CoC и «преимущество на Надежду»
 * Daggerheart: правка говорит не про бросок целиком, а про одну его часть.
 */
const partOf = (op: RollEditOp) => (op.part ? String(op.part) : undefined);

const inPart = (name: string | undefined, part?: string) => (part ? name === part : true);

const PRIMITIVES: Record<string, ClaimPrimitive | ResultPrimitive> = {
  // 5e: преимущество — «добавить кость» плюс «оставить лучшую».
  // Blades: та же правка одна, потому что пул и так читается лучшей.
  addDie: {
    stage: 'claim',
    label: 'добавить кость',
    apply(claim, op) {
      const count = num(op.count, 1);
      const part = partOf(op);
      const first = claim.dice[0];
      if (!first) throw new EngineError('«добавить кость» нечего добавлять: в броске нет костей');

      // Названной части кость подсаживается в неё саму: «ещё одна Надежда»
      // обязана остаться Надеждой, иначе часть перестанет сходиться.
      if (part) {
        const at = claim.dice.findIndex(d => d.name === part);
        if (at < 0) {
          throw new EngineError(
            `правка адресована части «${part}», а в этом броске такой части нет`);
        }
        return {
          ...claim,
          dice: claim.dice.map((d, i) => (i === at ? { ...d, count: num(d.count, 1) + count } : d)),
        };
      }

      const sides = num(op.sides, first.sides);
      // Кость того же размера подсаживается к своему терму, чужая — отдельным:
      // так пара Надежда/Страх не смешивается с добавленной костью.
      const at = claim.dice.findIndex(d => d.sides === sides && !d.name);
      if (at < 0) return { ...claim, dice: [...claim.dice, { count, sides }] };
      const dice = claim.dice.map((d, i) =>
        i === at ? { ...d, count: num(d.count, 1) + count } : d);
      return { ...claim, dice };
    },
  },

  keepBest: {
    stage: 'claim',
    label: 'оставить лучшую',
    apply: (claim, op) => ({
      ...claim,
      keeps: [...claim.keeps, { n: num(op.n, 1), from: 'best', part: partOf(op) }],
    }),
  },

  keepWorst: {
    stage: 'claim',
    label: 'оставить худшую',
    apply: (claim, op) => ({
      ...claim,
      keeps: [...claim.keeps, { n: num(op.n, 1), from: 'worst', part: partOf(op) }],
    }),
  },

  // Savage Worlds: черта ступенью выше. Cortex — то же словами step up.
  dieStep: {
    stage: 'claim',
    label: 'сменить величину кости',
    apply(claim, op) {
      const by = num(op.by, 1);
      const part = partOf(op);
      const ladder = Array.isArray(op.ladder) ? (op.ladder as number[]) : LADDER;
      const dice = claim.dice.map(d => {
        if (!inPart(d.name, part)) return d;
        const at = ladder.indexOf(d.sides);
        // Кости вне лестницы (к100) ступеней не имеют — оставляем как есть,
        // молча портить размер хуже, чем не сдвинуть.
        if (at < 0) return d;
        const next = Math.min(ladder.length - 1, Math.max(0, at + by));
        return { ...d, sides: ladder[next]! };
      });
      return { ...claim, dice };
    },
  },

  // GURPS, PF2e: правка идёт не в кости, а в сложность.
  shiftVersus: {
    stage: 'claim',
    label: 'сдвинуть порог',
    apply: (claim, op) => ({ ...claim, versusShift: claim.versusShift + num(op.by, 0) }),
  },

  // PF2e и PbtA: правка двигает не число, а ИСХОД — на ступень вверх или вниз
  // по объявленной шкале. Применяет её сравнивающий шаг: только он знает,
  // по какой таблице этот бросок читается степенями.
  shiftDegree: {
    stage: 'claim',
    label: 'сдвинуть степень успеха',
    apply: (claim, op) => ({ ...claim, degreeShift: claim.degreeShift + num(op.by, 0) }),
  },

  // Дыра 1 разбора: правка РЕЗУЛЬТАТА, а не заявки. Взрывающиеся кости
  // Savage Worlds и десятка Cyberpunk: выпал максимум — кинь ещё и прибавь.
  // Вниз (`at: 'min'`) — единица Cyberpunk RED: кинь ещё и ВЫЧТИ.
  explode: {
    stage: 'result',
    label: 'взрывать кости',
    apply(dice, op, die) {
      const limit = num(op.limit, 10); // цепочка конечна: бесконечность за столом не ждут
      const down = String(op.at ?? 'max') === 'min';
      const part = partOf(op);
      return dice.map(entry => {
        if (!inPart(entry.name, part)) return entry;
        const trigger = down ? 1 : entry.sides;
        if (entry.value !== trigger) return entry;
        let value = entry.value;
        let extra = entry.value;
        let guard = 0;
        while (extra === trigger && guard++ < limit) {
          extra = die(entry.sides);
          value += down ? -extra : extra;
        }
        return { ...entry, value };
      });
    },
  },
};

/**
 * Палитра для конструктора: ГОТОВЫЕ ФРАЗЫ, а не примитивы с настройками.
 *
 * Взрыв вверх и взрыв вниз — один примитив движка с разным параметром, но
 * для автора это два разных пункта списка. Выпадашка «направление взрыва»
 * внутри фишки была бы возвратом к старой стене настроек: пункт списка,
 * который сразу читается фразой, стоит дешевле любого параметра.
 *
 * Здесь же живут разумные умолчания параметров — в одном месте с примитивом,
 * а не в экране.
 */
export const editPalette = (): { key: string; label: string; op: RollEditOp }[] => [
  { key: 'addDie', label: 'добавить кость', op: { op: 'addDie' } },
  { key: 'keepBest', label: 'оставить лучшую', op: { op: 'keepBest', n: 1 } },
  { key: 'keepWorst', label: 'оставить худшую', op: { op: 'keepWorst', n: 1 } },
  { key: 'dieStep', label: 'сменить величину кости', op: { op: 'dieStep', by: 1 } },
  { key: 'shiftVersus', label: 'сдвинуть порог', op: { op: 'shiftVersus', by: -2 } },
  { key: 'shiftDegree', label: 'сдвинуть степень успеха', op: { op: 'shiftDegree', by: 1 } },
  { key: 'explodeUp', label: 'взрывать на максимуме', op: { op: 'explode' } },
  { key: 'explodeDown', label: 'взрывать на единице', op: { op: 'explode', at: 'min' } },
];

/** Какому пункту палитры отвечает уже положенный примитив. */
export const paletteKeyOf = (op: RollEditOp): string =>
  op.op === 'explode' ? (String(op.at ?? 'max') === 'min' ? 'explodeDown' : 'explodeUp')
    : String(op.op);

/** Имена реестра с лейблами — для проверок и служебных списков. */
export const editPrimitives = () =>
  Object.entries(PRIMITIVES).map(([op, p]) => ({ op, label: p.label, stage: p.stage }));

function primitiveOf(op: RollEditOp) {
  const found = PRIMITIVES[String(op.op)];
  if (!found) {
    throw new EngineError(
      `неизвестная правка броска «${op.op}»; есть: ${Object.keys(PRIMITIVES).join(', ')}`);
  }
  return found;
}

/** Заявка из константы кости: состав и чтение — как объявила система. */
export function claimOf(def: DieConstant): RollClaim {
  return {
    dice: def.dice || [], read: readingOf(def.read),
    keeps: [], versusShift: 0, degreeShift: 0,
  };
}

/** Правки заявки: применяются ДО броска, по порядку записей. */
export function applyClaimEdits(claim: RollClaim, edits: RollEdit[]): RollClaim {
  let next = claim;
  for (const edit of edits) {
    for (const op of edit.ops || []) {
      const primitive = primitiveOf(op);
      if (primitive.stage === 'claim') next = primitive.apply(next, op);
    }
  }
  return next;
}

/** Правки результата: применяются к выпавшему, до чтения. */
export function applyResultEdits(dice: RolledDie[], edits: RollEdit[], die: Die): RolledDie[] {
  let next = dice;
  for (const edit of edits) {
    for (const op of edit.ops || []) {
      const primitive = primitiveOf(op);
      if (primitive.stage === 'result') next = primitive.apply(next, op, die);
    }
  }
  return next;
}

/**
 * Отбор по «оставить N»: возвращает кости, которые пойдут в чтение.
 * Порядок выпавших не трогается — журнал показывает бросок как он был.
 */
export function keptDice(dice: RolledDie[], keeps: KeepSpec[]): RolledDie[] {
  let out = dice;
  for (const keep of keeps) {
    // Отбор внутри своей части: прочие кости проходят мимо нетронутыми,
    // иначе «оставить лучшую Надежду» выкинуло бы Страх из броска.
    const mine = keep.part ? out.filter(d => d.name === keep.part) : out;
    const chosen = new Set([...mine]
      .sort((a, b) => (keep.from === 'best' ? b.value - a.value : a.value - b.value))
      .slice(0, Math.max(1, keep.n)));
    // Порядок выпавших не трогается — журнал показывает бросок как он был.
    out = out.filter(d => !mine.includes(d) || chosen.has(d));
  }
  return out;
}
