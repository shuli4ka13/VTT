import { EngineError } from '../engine/errors.ts';
import { dieConstant } from '../engine/lead-die.ts';
import { DICE_TEXT } from '../words/glossary.ts';
import { parse, withCount, start, result } from './dice.ts';
import type { Spec, PendingAddend } from './dice.ts';
import type { System } from '../model/types.ts';

export interface DieSource { die?: unknown; count?: unknown; minus?: unknown }

export interface DieReader {
  number: (ref: unknown, what: string) => number;
  text: (ref: unknown) => unknown;
}

const present = (value: unknown): boolean => value !== undefined && value !== null && value !== '';

export const hasDie = (source: unknown): source is DieSource =>
  typeof source === 'object' && source !== null && present((source as DieSource).die);

export function dieSpec(system: System, die: unknown, count: unknown, read: DieReader, owner: string): Spec {
  let spec: Spec;
  if (typeof die === 'string' && system.constants?.[die]) {
    spec = parse(dieConstant(system, die), read.number);
  } else if (typeof die === 'string' && DICE_TEXT.test(die.trim())) {
    spec = parse(die.trim());
  } else if (typeof die === 'string') {
    throw new EngineError(`${owner}: кости «${die}» нет в «Костях» системы`);
  } else if (die && typeof die === 'object' && 'expr' in die) {
    const text = String(read.text(die) ?? '').trim();
    if (!DICE_TEXT.test(text)) throw new EngineError(`${owner}: «${text}» — не запись кости; жду вроде «1к20» или «2к6»`);
    spec = parse(text);
  } else {
    throw new EngineError(`${owner}: нужна кость — из «Костей» системы или запись вроде «1к20»`);
  }
  return present(count) ? withCount(spec, read.number(count, 'сколько костей'), owner) : spec;
}

export function dieAddend(label: string, system: System, source: DieSource, read: DieReader): PendingAddend {
  return {
    label,
    value: die => {
      const total = result(start(dieSpec(system, source.die, source.count, read, label), [], die)).total;
      return source.minus === true ? -total : total;
    },
  };
}
