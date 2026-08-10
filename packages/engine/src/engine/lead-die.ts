// Ведущая кость — константа системы: что бросается для действий в этом мире.
//
// Определение описывает и состав броска (сколько костей, какого размера),
// и что возвращается: одно значение или несколько именованных.
//   5e:          { dice: [{ count: 1, sides: 20 }] }               → total
//   Daggerheart: { dice: [{ sides: 12, name: 'hope' },
//                         { sides: 12, name: 'fear' }] }           → total + parts
//
// Инвариант: total ЕСТЬ ВСЕГДА. Порог сравнивает его одинаково в обеих
// системах; именованные части лежат сверх него, и смотрит на них только
// тот шаг, которому они нужны.
//
// Броски правил ссылаются на константу ({ constant: 'lead_die' }), а не пишут
// «1d20»: смена размера кости в данных системы меняет все броски разом.

import { EngineError } from './errors.ts';
import type { System, DieConstant, Die } from '../model/types.ts';
import type { RollMode } from './dice.ts';

/**
 * Результат ведущего броска. `total` есть ВСЕГДА — порог сравнивает его
 * одинаково в любой системе; именованные части лежат сверх него.
 */
export interface LeadRoll {
  rolls: number[];
  kept: number | null;
  total: number;
  parts: Record<string, number>;
  mode: RollMode;
}

export function dieConstant(system: System, name: string): DieConstant {
  const constants = system.constants;
  if (!constants || !Object.keys(constants).length) {
    throw new EngineError(
      `система «${system.id || '?'}» не объявляет констант — ведущую кость взять неоткуда`);
  }
  const def = constants[name];
  if (!def) {
    throw new EngineError(
      `система не объявляет константы «${name}» — есть: ${Object.keys(constants).join(', ')}`);
  }
  if (def.kind !== 'die') {
    throw new EngineError(`константа «${name}» — не кость (${def.kind}); ею не бросают`);
  }
  return def as DieConstant;
}

export function rollLead(def: DieConstant, die: Die, mode: RollMode = 'normal'): LeadRoll {
  const dice = def.dice || [];
  const first = dice[0];
  const single = dice.length === 1 && !!first && (first.count || 1) === 1 && !first.name;

  // Преимущество и помеха определены для одиночной кости: две, берём лучшую
  // или худшую. Что они значат для составного броска (пара Надежда/Страх),
  // решает система, а не движок — пока честно не отыгрываем и говорим об этом
  // ('normal' в результате); см. docs/production-differences.md.
  if (single && (mode === 'advantage' || mode === 'disadvantage')) {
    const rolls = [die(first!.sides), die(first!.sides)];
    const kept = mode === 'advantage' ? Math.max(...rolls) : Math.min(...rolls);
    return { rolls, kept, total: kept, parts: {}, mode };
  }

  const rolls: number[] = [];
  const parts: Record<string, number> = {};
  for (const spec of dice) {
    let sum = 0;
    for (let i = 0; i < (spec.count || 1); i++) {
      const value = die(spec.sides);
      rolls.push(value);
      sum += value;
    }
    if (spec.name) parts[String(spec.name)] = sum;
  }
  const total = rolls.reduce((a, b) => a + b, 0);
  const kept = single ? rolls[0]! : null;
  return { rolls, kept, total, parts, mode: 'normal' };
}
