import type { Die } from '../model/types.ts';

export interface NotationRoll {
  notation: unknown;
  rolls: number[];
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

