import type { Die } from '../model/types.ts';

export interface NotationRoll {
  notation: unknown;
  rolls: number[];
  total: number;
}

export const randomDie: Die = sides => 1 + Math.floor(Math.random() * sides);

const NOTATION = /^(\d+)?\s*[dдк]\s*(\d+)$/iu;

export function rollNotation(notation: unknown, die: Die): NotationRoll {
  const match = NOTATION.exec(String(notation).trim());
  if (!match) throw new Error(`не понимаю запись кубиков «${notation}»; ожидается вид «2к6»`);

  const count = Number(match[1] ?? 1);
  const sides = Number(match[2]);
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) rolls.push(die(sides));

  return { notation, rolls, total: rolls.reduce((a, b) => a + b, 0) };
}


export interface DiceTape { die: Die; tape: number[] }

export function tapeDie(die: Die): DiceTape {
  const tape: number[] = [];
  return {
    tape,
    die: sides => { const value = die(sides); tape.push(value); return value; },
  };
}

export function replayDie(tape: number[], fallback: Die): Die {
  let at = 0;
  return sides => (at < tape.length ? tape[at++]! : fallback(sides));
}
