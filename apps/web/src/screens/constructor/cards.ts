// Склейка шагов в карточки и заготовки цепочек.
//
// В данных живут пять команд движка, на экране — три понятия:
//   проверка  = threshold | compare
//   изменение = apply | status; пара «amount + apply, который берёт ровно
//               его результат и никому больше не нужный» рисуется ОДНОЙ
//               карточкой — так атака остаётся двумя карточками без имён
//   число     = amount сам по себе (превышения, одно число на два изменения)
//
// Заготовки не знают ни одного тега поля (критерий №3): всё, что зависит
// от системы, остаётся оранжевым пропуском.

import type { System, Step } from '@vtt/schema';
import { freeId } from '../../store/world.ts';

export type CardKind = 'check' | 'change' | 'number' | 'unknown';

export interface CardGroup {
  kind: CardKind;
  /** Индексы шагов эффекта, которые правит эта карточка (1 или 2). */
  indices: number[];
  /** Главный шаг карточки: для склеенной пары — apply. */
  step: Step;
  /** Склеенный amount, если карточка «изменение» несёт число в себе. */
  amount: Step | null;
}

const KIND_OF: Record<string, CardKind> = {
  threshold: 'check', compare: 'check', apply: 'change', status: 'change', amount: 'number',
};

const takesWhole = (value: unknown, id: string): boolean =>
  !!value && typeof value === 'object' && (value as Record<string, unknown>).ref === id;

const mentions = (step: Step, id: string): boolean => {
  const text = JSON.stringify(step);
  return text.includes(`"ref":"${id}"`) || text.includes(`"ref":"${id}.`);
};

export function groupSteps(list: Step[]): CardGroup[] {
  const out: CardGroup[] = [];
  for (let i = 0; i < list.length; i++) {
    const step = list[i]!;
    const next = list[i + 1];
    const glue = step.type === 'amount' && step.id && next?.type === 'apply'
      && takesWhole((next as any).value, step.id)
      && list.every((other, j) => j === i || j === i + 1 || !mentions(other, step.id!));
    if (glue) {
      out.push({ kind: 'change', indices: [i, i + 1], step: next!, amount: step });
      i++;
      continue;
    }
    out.push({ kind: KIND_OF[step.type] ?? 'unknown', indices: [i], step, amount: null });
  }
  return out;
}

// ── заготовки ───────────────────────────────────────────────────────────

export interface StepTemplate {
  key: string;
  label: string;
  hint: string;
  make(system: System, takenIds: string[]): Step[];
}

const firstDie = (system: System): string | undefined => Object.keys(system.constants ?? {})[0];

const blankCheck = (system: System): Step => {
  const die = firstDie(system);
  return {
    type: 'threshold', side: 'sender', successWhen: 'atLeast', continueOn: 'success',
    roll: { die: die ? { constant: die } : undefined, check: null },
  } as unknown as Step;
};

const numberPlusChange = (taken: string[], direction: 'subtract' | 'add'): Step[] => {
  const id = freeId(taken, 'n');
  return [
    { id, type: 'amount', source: 'roll' } as unknown as Step,
    {
      type: 'apply', direction, targetModifiers: direction === 'subtract', value: { ref: id },
    } as unknown as Step,
  ];
};

export const STEP_TEMPLATES: StepTemplate[] = [
  {
    key: 'attack', label: '+ атака с броском',
    hint: 'Бросок против поля цели; попал — цель теряет посчитанное.',
    make: (system, taken) => [blankCheck(system), ...numberPlusChange(taken, 'subtract')],
  },
  {
    key: 'damage', label: '+ просто урон',
    hint: 'Без проверки: посчитать и вычесть из поля цели.',
    make: (_system, taken) => numberPlusChange(taken, 'subtract'),
  },
  {
    key: 'heal', label: '+ лечение',
    hint: 'Посчитать и прибавить к полю цели.',
    make: (_system, taken) => numberPlusChange(taken, 'add'),
  },
  {
    key: 'status', label: '+ наложить состояние',
    hint: 'Повесить на цель эффект-состояние.',
    make: () => [{ type: 'status', mode: 'apply' } as unknown as Step],
  },
];

export const BRICKS: StepTemplate[] = [
  {
    key: 'check', label: '+ проверка',
    hint: 'Бросок или сравнение против поля цели. Может оборвать эффект.',
    make: system => [blankCheck(system)],
  },
  {
    key: 'change', label: '+ изменение',
    hint: 'Изменить поле цели или повесить состояние. Единственное, что меняет мир.',
    make: () => [{ type: 'apply', direction: 'subtract', targetModifiers: true } as unknown as Step],
  },
  {
    key: 'number', label: '+ число',
    hint: 'Отдельное число: превышение проверки или одно число на несколько изменений.',
    make: (_system, taken) => [{ id: freeId(taken, 'n'), type: 'amount', source: 'roll' } as unknown as Step],
  },
];
