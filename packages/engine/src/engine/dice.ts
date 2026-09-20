import type { Die } from '../model/types.ts';

export interface NotationRoll {
  notation: unknown;
  rolls: number[];
  total: number;

  tally: { dice: number; atMax: number; atMin: number };
}

export const randomDie: Die = sides => 1 + Math.floor(Math.random() * sides);

const NOTATION = /^(\d+)?\s*[dдк]\s*(\d+)$/iu;

export function multiplyNotation(notation: unknown, times: number): string {
  const match = NOTATION.exec(String(notation).trim());
  if (!match) throw new Error(`не понимаю запись кубиков «${notation}»; ожидается вид «2к6»`);
  const count = Number(match[1] ?? 1) * Math.max(1, Math.floor(times));
  return `${count}d${Number(match[2])}`;
}

export function rollNotation(notation: unknown, die: Die): NotationRoll {
  const match = NOTATION.exec(String(notation).trim());
  if (!match) throw new Error(`не понимаю запись кубиков «${notation}»; ожидается вид «2к6»`);

  const count = Number(match[1] ?? 1);
  const sides = Number(match[2]);
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) rolls.push(die(sides));

  return {
    notation,
    rolls,
    total: rolls.reduce((sum, value) => sum + value, 0),
    tally: {
      dice: rolls.length,
      atMax: rolls.filter(value => value === sides).length,
      atMin: rolls.filter(value => value === 1).length,
    },
  };
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
