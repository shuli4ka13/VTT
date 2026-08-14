// Чтение — вторая ось константы кости: КАК выпавшие кости становятся числом.
// Первая ось — состав (сколько костей, каких граней, какие части). Разбор
// семнадцати систем — спека «Что такое бросок»: сумма (5e, GURPS, PbtA),
// «оставить N лучших» (Blades, Savage Worlds, Traveller, L5R), счёт успехов
// (Shadowrun, Мир Тьмы).
//
// Реестр по образцу engine/steps: ядро не знает ни одного чтения лично,
// новое чтение = модуль + строка здесь. Свободной формулой чтение не делаем
// сознательно: правкам броска (следующий этап) нужно, за что цепляться —
// «добавить кость» обязана знать, что кости именно считают, а не влезать
// текстом в выражение.

import { EngineError } from './errors.ts';

/** Выпавшая кость: значение, грани (для счёта максимумов) и часть состава. */
export interface RolledDie {
  value: number;
  sides: number;
  name?: string;
}

/** Нормализованное чтение: имя из реестра плюс его параметры. */
export interface ReadSpec { kind: string; [key: string]: unknown }

export interface ReadOutcome {
  /** Прочитанное число — уезжает в total; порог сравнивает его, не зная, чем читали. */
  total: number;
  /** Одна оставленная кость — для журнала «[4, 17] → 17». Null, если чтение не выбирает одну. */
  kept: number | null;
}

interface Reading {
  label: string;
  read(dice: RolledDie[], spec: ReadSpec): ReadOutcome;
}

const sum: Reading = {
  label: 'сумма',
  read(dice) {
    const total = dice.reduce((acc, d) => acc + d.value, 0);
    return { total, kept: dice.length === 1 ? dice[0]!.value : null };
  },
};

// «Лучшая» обобщена до «оставить N, сумма» разбором второго эшелона:
// Traveller (3d6, оставить 2), L5R (XkY), Cortex (две лучших из пула).
// Лучшая-из-всех — частный случай N = 1, он же умолчание.
const keeping = (best: boolean): Reading => ({
  label: best ? 'лучшая' : 'худшая',
  read(dice, spec) {
    const keep = Math.max(1, Number(spec.keep ?? 1));
    const taken = [...dice]
      .sort((a, b) => (best ? b.value - a.value : a.value - b.value))
      .slice(0, keep);
    const total = taken.reduce((acc, d) => acc + d.value, 0);
    return { total, kept: taken.length === 1 ? taken[0]!.value : null };
  },
});

// Порог на КАЖДУЮ кость — те же слова направления, что у successWhen порога.
const PER_DIE: Record<string, (value: number, versus: number) => boolean> = {
  atLeast: (v, n) => v >= n,
  notOver: (v, n) => v <= n,
  over: (v, n) => v > n,
  under: (v, n) => v < n,
};

const count: Reading = {
  label: 'счёт успехов',
  read(dice, spec) {
    const direction = Object.keys(PER_DIE).find(key => spec[key] !== undefined);
    if (!direction) {
      throw new EngineError(
        `чтению «счёт успехов» нужен порог на кость — одно из: ${Object.keys(PER_DIE).join(', ')}`);
    }
    const versus = Number(spec[direction]);
    const hit = PER_DIE[direction]!;
    return { total: dice.filter(d => hit(d.value, versus)).length, kept: null };
  },
};

const READINGS: Record<string, Reading> = {
  sum,
  best: keeping(true),
  worst: keeping(false),
  count,
};

/** Имена реестра с человеческими лейблами — для словаря «Кости» конструктора. */
export const readingKinds = () =>
  Object.entries(READINGS).map(([kind, r]) => ({ kind, label: r.label }));

/** Нормализация поля `read` константы: пусто — сумма, строка — имя без параметров. */
export function readingOf(raw: unknown): ReadSpec {
  if (raw === undefined || raw === null || raw === '') return { kind: 'sum' };
  if (typeof raw === 'string') return { kind: raw };
  if (typeof raw === 'object' && 'kind' in raw) return raw as ReadSpec;
  throw new EngineError(
    `не понимаю чтение костей «${JSON.stringify(raw)}» — жду имя чтения или { kind, … }`);
}

export function applyReading(dice: RolledDie[], spec: ReadSpec): ReadOutcome {
  const reading = READINGS[spec.kind];
  if (!reading) {
    throw new EngineError(
      `неизвестное чтение костей «${spec.kind}»; есть: ${Object.keys(READINGS).join(', ')}`);
  }
  // Пустой пул (счёт из листа дал ноль костей) — честный ноль, а не падение
  // на Math-операциях: «ноль костей — кинь две, возьми худшую» Blades — это
  // условная правка заявки следующего этапа, не забота чтения.
  if (!dice.length) return { total: 0, kept: null };
  return reading.read(dice, spec);
}
