// Ведущая кость — константа системы: что бросается для действий в этом мире.
//
// Определение описывает состав броска (сколько костей, какого размера),
// ЧТЕНИЕ (как выпавшие кости становятся числом — engine/readings.ts)
// и что возвращается: одно значение или несколько именованных.
//   5e:          { dice: [{ count: 1, sides: 20 }] }               → total
//   Daggerheart: { dice: [{ sides: 12, name: 'hope' },
//                         { sides: 12, name: 'fear' }] }           → total + parts
//   Blades:      { dice: [{ count: {tag}, sides: 6 }], read: 'best' }
//   Shadowrun:   { dice: [{ count: {tag}, sides: 6 }],
//                  read: { kind: 'count', atLeast: 5 } }           → total = успехи
//
// Инвариант: total ЕСТЬ ВСЕГДА, и это ПРОЧИТАННОЕ число, а не обязательно
// сумма. Порог сравнивает его одинаково во всех системах; именованные части
// лежат сверх него, и смотрит на них только тот шаг, которому они нужны.
//
// Броски правил ссылаются на константу ({ constant: 'lead_die' }), а не пишут
// «1d20»: смена размера кости в данных системы меняет все броски разом.

import { EngineError } from './errors.ts';
import { readingOf, applyReading } from './readings.ts';
import type { RolledDie } from './readings.ts';
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
  /** Чем читали — журнал пишет «успехов 2» и «сумма 11» по-разному. */
  read: string;
  /** Счёт по выпавшему: кинуто костей, из них на максимуме и на единице.
   * Дёшев и ждёт степеней следующего этапа: глитч Shadowrun — единиц больше
   * полпула, криты Blades и Daggerheart — по максимумам. */
  tally: { dice: number; atMax: number; atMin: number };
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

/** Разрешатель счёта-ссылки: приносит вызывающий — у броска нет доступа к листу. */
export type CountResolver = (ref: unknown, what: string) => number;

/**
 * Развернуть состав: счёт костей может быть ссылкой — пул Shadowrun и Blades
 * собирается из листа (Тело + Оружие). Ссылки разрешаются в числа ДО броска;
 * rollLead принимает только развёрнутый состав.
 */
export function unfoldDice(def: DieConstant, resolveCount?: CountResolver): DieConstant {
  const dice = (def.dice || []).map(spec => {
    const raw = spec.count ?? 1;
    if (typeof raw === 'number') return spec;
    if (!resolveCount) {
      throw new EngineError(
        `счёт костей «${def.label || '?'}» — ссылка, а разрешить её здесь нечем`);
    }
    const count = resolveCount(raw, `счёт костей «${spec.label || def.label || '?'}»`);
    if (!Number.isInteger(count) || count < 0) {
      throw new EngineError(
        `счёт костей «${def.label || '?'}» должен быть целым не меньше нуля, а вышло ${count}`);
    }
    return { ...spec, count };
  });
  return { ...def, dice };
}

export function rollLead(def: DieConstant, die: Die, mode: RollMode = 'normal'): LeadRoll {
  const spec = readingOf(def.read);
  const dice = def.dice || [];
  const first = dice[0];
  const single = dice.length === 1 && !!first && (first.count || 1) === 1 && !first.name
    && spec.kind === 'sum';

  // Преимущество и помеха определены для одиночной кости с чтением-суммой:
  // две, берём лучшую или худшую. Что они значат для составного броска (пара
  // Надежда/Страх) или пула с другим чтением, решает система, а не движок —
  // до этапа правок заявки честно не отыгрываем и говорим об этом ('normal'
  // в результате); см. docs/production-differences.md.
  if (single && (mode === 'advantage' || mode === 'disadvantage')) {
    const sides = first!.sides;
    const entries: RolledDie[] = [{ value: die(sides), sides }, { value: die(sides), sides }];
    const values = entries.map(e => e.value);
    const kept = mode === 'advantage' ? Math.max(...values) : Math.min(...values);
    return {
      rolls: values, kept, total: kept, parts: {}, mode,
      read: spec.kind, tally: tallyOf(entries),
    };
  }

  const entries: RolledDie[] = [];
  const parts: Record<string, number> = {};
  for (const term of dice) {
    const count = term.count ?? 1;
    if (typeof count !== 'number') {
      throw new EngineError(
        `счёт костей «${def.label || '?'}» — неразрешённая ссылка; сперва unfoldDice`);
    }
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const value = die(term.sides);
      entries.push({ value, sides: term.sides, ...(term.name ? { name: String(term.name) } : {}) });
      sum += value;
    }
    if (term.name) parts[String(term.name)] = sum;
  }

  const { total, kept } = applyReading(entries, spec);
  return {
    rolls: entries.map(e => e.value), kept, total, parts, mode: 'normal',
    read: spec.kind, tally: tallyOf(entries),
  };
}

function tallyOf(entries: RolledDie[]) {
  return {
    dice: entries.length,
    atMax: entries.filter(e => e.value === e.sides).length,
    atMin: entries.filter(e => e.value === 1).length,
  };
}
