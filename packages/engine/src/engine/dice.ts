// Броски. Источник случайности всегда передаётся снаружи — функцией `die(sides)`.
//
// В продакшне это будет проверяемый бросок сервера или общая сидированная цепочка
// на всю комнату. Здесь важно другое: движок не дёргает Math.random сам, поэтому
// любой бросок воспроизводим в тесте.

import type { Die } from '../model/types.ts';

export interface NotationRoll {
  notation: unknown;
  rolls: number[];
  total: number;
}

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export interface CheckRoll {
  sides: number;
  mode: RollMode;
  rolls: number[];
  kept: number;
  bonus: number;
  total: number;
}

export const randomDie: Die = sides => 1 + Math.floor(Math.random() * sides);

const NOTATION = /^(\d+)d(\d+)$/;

export function rollNotation(notation: unknown, die: Die): NotationRoll {
  const match = NOTATION.exec(String(notation).trim());
  if (!match) throw new Error(`не понимаю запись кубиков «${notation}»; ожидается вид «2d6»`);

  const count = Number(match[1]);
  const sides = Number(match[2]);
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) rolls.push(die(sides));

  return { notation, rolls, total: rolls.reduce((a, b) => a + b, 0) };
}

// Проверка: кость плюс бонус, с учётом режима броска.
// Режим приходит из модификаторов породы «правящие бросок» (см. modifiers.ts)
// и здесь только отыгрывается.
export function rollCheck(
  { sides = 20, bonus = 0, mode = 'normal' as RollMode },
  die: Die,
): CheckRoll {
  const rolls = [die(sides)];
  if (mode === 'advantage' || mode === 'disadvantage') rolls.push(die(sides));

  const kept = mode === 'advantage' ? Math.max(...rolls)
    : mode === 'disadvantage' ? Math.min(...rolls)
      : rolls[0]!;

  return { sides, mode, rolls, kept, bonus, total: kept + bonus };
}
