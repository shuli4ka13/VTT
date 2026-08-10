// Мост к движку. Единственное место, где интерфейс зовёт вычисления.
//
// Два правила, оба выстраданы PoC:
//
// 1. ПРОХОД СОЗДАЁТСЯ ОДИН НА ПЕРЕРИСОВКУ. Мемоизация внутри прохода —
//    ради неё он и нужен; мемоизация МЕЖДУ перерисовками была бы ошибкой:
//    правка чарника перестала бы быть видна.
//
// 2. ОШИБКА ПОКАЗЫВАЕТСЯ В ЯЧЕЙКЕ, А НЕ РОНЯЕТ ЭКРАН. Интерфейс обязан
//    пережить любое промежуточное состояние правки: недописанную формулу,
//    условие на полуслове, мишень на только что удалённое поле.

import { useMemo } from 'react';
import type { System, Sheet, Compendium } from '@vtt/schema';
import { newPass, calc } from '@vtt/engine/engine/calc';
import { resolveRoll } from '@vtt/engine/engine/modifiers';
import type { Pass } from '@vtt/engine/engine/calc';

export type Computed =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export interface Reader {
  /** Значение поля. Ошибка не бросается — она возвращается и рисуется в ячейке. */
  valueOf: (tag: string) => Computed;
  /** Режим броска: обычный, преимущество или помеха. */
  rollOf: (tag: string) => { mode: string; bonus: number; methods: string[] } | null;
}

export function useReader(system: System, sheet: Sheet | null, compendium: Compendium): Reader {
  return useMemo(() => {
    if (!sheet) {
      const idle: Reader = {
        valueOf: () => ({ ok: false, error: 'персонаж не выбран' }),
        rollOf: () => null,
      };
      return idle;
    }

    let pass: Pass;
    try {
      pass = newPass(system, sheet, { compendium });
    } catch (err) {
      // Мир может быть сломан целиком — например, предмет ссылается на
      // мишень, которой больше нет. Экран обязан открыться и показать это.
      const message = (err as Error).message;
      const broken: Reader = {
        valueOf: () => ({ ok: false, error: message }),
        rollOf: () => null,
      };
      return broken;
    }

    const reader: Reader = {
      valueOf: tag => {
        try { return { ok: true, value: calc(system, sheet, tag, pass) }; }
        catch (err) { return { ok: false, error: (err as Error).message }; }
      },
      rollOf: tag => {
        try { return resolveRoll(system, sheet, tag, pass); }
        catch { return null; }
      },
    };
    return reader;
    // Проход пересоздаётся на каждое изменение мира — это и есть правило №1.
  }, [system, sheet, compendium]);
}

/** Показать посчитанное. Ошибка — короткой пометкой, подробность в подсказке. */
export function show(value: Computed): { text: string; title?: string; bad: boolean } {
  if (!value.ok) return { text: '—', title: value.error, bad: true };
  if (typeof value.value === 'boolean') return { text: value.value ? '✔' : '✕', bad: false };
  if (value.value === null || value.value === undefined) return { text: '—', bad: false };
  return { text: String(value.value), bad: false };
}
