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

export function dieConstant(system, name) {
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
  return def;
}

export function rollLead(def, die, mode = 'normal') {
  const dice = def.dice || [];
  const single = dice.length === 1 && (dice[0].count || 1) === 1 && !dice[0].name;

  // Преимущество и помеха определены для одиночной кости: две, берём лучшую
  // или худшую. Что они значат для составного броска (пара Надежда/Страх),
  // решает система, а не движок — пока честно не отыгрываем и говорим об этом
  // ('normal' в результате); см. docs/production-differences.md.
  if (single && (mode === 'advantage' || mode === 'disadvantage')) {
    const rolls = [die(dice[0].sides), die(dice[0].sides)];
    const kept = mode === 'advantage' ? Math.max(...rolls) : Math.min(...rolls);
    return { rolls, kept, total: kept, parts: {}, mode };
  }

  const rolls = [];
  const parts = {};
  for (const spec of dice) {
    let sum = 0;
    for (let i = 0; i < (spec.count || 1); i++) {
      const value = die(spec.sides);
      rolls.push(value);
      sum += value;
    }
    if (spec.name) parts[spec.name] = sum;
  }
  const total = rolls.reduce((a, b) => a + b, 0);
  const kept = single ? rolls[0] : null;
  return { rolls, kept, total, parts, mode: 'normal' };
}
