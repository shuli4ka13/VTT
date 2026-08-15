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

/** Кто-нибудь вообще упоминает результат — хоть целиком, хоть частью. */
const mentions = (step: Step, id: string): boolean => {
  const text = JSON.stringify(step);
  if (text.includes(`"ref":"${id}"`) || text.includes(`"ref":"${id}.`)) return true;
  return names(step, id);
};

/** Число взято ЦЕЛИКОМ: ссылкой `{ref: 'dmg'}` либо именем в выражении. */
const takesWhole = (value: unknown, id: string): boolean =>
  !!value && typeof value === 'object' && (value as Record<string, unknown>).ref === id;

/**
 * Имя числа в формуле — «#хп − #dmg». Такая же ссылка, как `{ref}`, и
 * держать карточку она должна не слабее: без этого пара разваливалась
 * надвое ровно в тот момент, когда автор впервые правил выражение.
 */
const names = (step: Step, id: string): boolean =>
  new RegExp(`#${id}(?![\\p{L}\\p{N}_])`, 'u').test(JSON.stringify(step));

export function groupSteps(list: Step[]): CardGroup[] {
  const out: CardGroup[] = [];
  for (let i = 0; i < list.length; i++) {
    const step = list[i]!;
    const next = list[i + 1];
    const source = (step as any).source;
    // Клеим и к «состоянию» тоже: карточка «изменение» — одна и та же,
    // переключатель поле/состояние внутри неё не должен разваливать её
    // надвое. Числу у состояния работы нет, но оно сохраняется — вернул
    // переключатель обратно, вернулась и величина.
    const glue = step.type === 'amount' && step.id
      && (next?.type === 'apply' || next?.type === 'status')
      && (source === 'roll' || source === undefined)
      && (takesWhole((next as any).value, step.id) || names(next, step.id))
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

// ── кирпичи ─────────────────────────────────────────────────────────────
// Палитра — ТОЛЬКО три кирпича. Готовых связок у инструмента нет: готовое
// живёт в палитре образцов и копируется целиком из конкретных систем —
// у «атаки» есть автор, и это не мы.

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

/**
 * Перенос карточки на соседнее место. Двигается ГРУППА целиком: склеенная
 * пара «число + изменение» — одна карточка на экране и обязана оставаться
 * одной при переносе, иначе половина уедет, а половина останется.
 *
 * Ссылки при переносе не чинятся сознательно: если изменение уехало выше
 * своей проверки, приговор так и скажет — «шага выше нет». Молча
 * переписывать ссылки значило бы решать за автора.
 */
export function moveGroup(steps: Step[], groupIndex: number, delta: -1 | 1): Step[] {
  const groups = groupSteps(steps);
  const here = groups[groupIndex];
  const there = groups[groupIndex + delta];
  if (!here || !there) return steps;

  const slice = (g: CardGroup) => g.indices.map(i => steps[i]!);
  const [first, second] = delta === -1 ? [there, here] : [here, there];
  const head = steps.slice(0, first.indices[0]!);
  const tail = steps.slice(second.indices[second.indices.length - 1]! + 1);
  return [...head, ...slice(second), ...slice(first), ...tail];
}
