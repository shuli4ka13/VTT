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

/** Заявка: что собираются бросить, ещё не бросив. */
export interface RollClaim {
  dice: DiceTerm[];
  read: ReadSpec;
  /** Сколько костей оставить и с какого конца. Null — читаются все. */
  keep: { n: number; from: 'best' | 'worst' } | null;
  /** Сдвиг порога: ±2 к сложности в GURPS и PF2e — правка броска, не поля. */
  versusShift: number;
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

const PRIMITIVES: Record<string, ClaimPrimitive | ResultPrimitive> = {
  // 5e: преимущество — «добавить кость» плюс «оставить лучшую».
  // Blades: та же правка одна, потому что пул и так читается лучшей.
  addDie: {
    stage: 'claim',
    label: 'добавить кость',
    apply(claim, op) {
      const count = num(op.count, 1);
      const first = claim.dice[0];
      if (!first) throw new EngineError('«добавить кость» нечего добавлять: в броске нет костей');
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
    apply: (claim, op) => ({ ...claim, keep: { n: num(op.n, 1), from: 'best' } }),
  },

  keepWorst: {
    stage: 'claim',
    label: 'оставить худшую',
    apply: (claim, op) => ({ ...claim, keep: { n: num(op.n, 1), from: 'worst' } }),
  },

  // Savage Worlds: черта ступенью выше. Cortex — то же словами step up.
  dieStep: {
    stage: 'claim',
    label: 'сменить величину кости',
    apply(claim, op) {
      const by = num(op.by, 1);
      const ladder = Array.isArray(op.ladder) ? (op.ladder as number[]) : LADDER;
      const dice = claim.dice.map(d => {
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

  // Дыра 1 разбора: правка РЕЗУЛЬТАТА, а не заявки. Взрывающиеся кости
  // Savage Worlds и десятка Cyberpunk: выпал максимум — кинь ещё и прибавь.
  explode: {
    stage: 'result',
    label: 'взрывать кости',
    apply(dice, op, die) {
      const limit = num(op.limit, 10); // цепочка конечна: бесконечность за столом не ждут
      return dice.map(entry => {
        let value = entry.value;
        let extra = entry.value;
        let guard = 0;
        while (extra === entry.sides && guard++ < limit) {
          extra = die(entry.sides);
          value += extra;
        }
        return { ...entry, value };
      });
    },
  },
};

/** Имена реестра с лейблами — конструктору правок в словаре. */
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
  return { dice: def.dice || [], read: readingOf(def.read), keep: null, versusShift: 0 };
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
export function keptDice(dice: RolledDie[], keep: RollClaim['keep']): RolledDie[] {
  if (!keep) return dice;
  const n = Math.max(1, keep.n);
  const sorted = [...dice].sort((a, b) =>
    keep.from === 'best' ? b.value - a.value : a.value - b.value);
  return sorted.slice(0, n);
}
