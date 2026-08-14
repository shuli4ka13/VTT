// Сколько костей в составе, если это известно заранее.
//
// Раньше здесь жил разбор строки состава («1d12 Надежда + 1d12 Страх»), и это
// была ошибка: грамматику, о которой автору нигде не сказано, угадать нельзя.
// Состав правится строками (DiceComposer в dictionaries.tsx), а от разбора
// остался один вопрос — сколько костей выпадет.

import type { DiceTerm } from '@vtt/schema';

/** Null — пул из листа: заранее неизвестно, и это отдельный ответ. */
export function diceCount(dice: DiceTerm[] | undefined): number | null {
  let total = 0;
  for (const term of dice ?? []) {
    const count = term.count ?? 1;
    if (typeof count !== 'number') return null;
    total += count;
  }
  return total;
}
