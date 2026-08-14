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
// Правки броска (преимущество и его родня) приезжают сюда СПИСКОМ ЗАПИСЕЙ
// словаря системы, а не режимом: что запись делает — сложено из примитивов
// (engine/roll-edits.ts), как её зовут — дело автора мира.
//
// Броски правил ссылаются на константу ({ constant: 'lead_die' }), а не пишут
// «1d20»: смена размера кости в данных системы меняет все броски разом.

import { EngineError } from './errors.ts';
import { applyReading } from './readings.ts';
import { claimOf, applyClaimEdits, applyResultEdits, keptDice } from './roll-edits.ts';
import type { RolledDie } from './readings.ts';
import type { System, DieConstant, Die, RollEdit } from '../model/types.ts';

/**
 * Результат ведущего броска. `total` есть ВСЕГДА — порог сравнивает его
 * одинаково в любой системе; именованные части лежат сверх него.
 */
export interface LeadRoll {
  rolls: number[];
  kept: number | null;
  total: number;
  parts: Record<string, number>;
  /** Какие записи словаря правок применились — журналу и трассе. */
  edits: string[];
  /** Сдвиг порога от правок: его прибавляет сравнивающий шаг. */
  versusShift: number;
  /** Чем читали — журнал пишет «успехов 2» и «сумма 11» по-разному. */
  read: string;
  /** Счёт по НАТУРАЛЬНО выпавшему: кинуто костей, из них на максимуме и на
   * единице. Считается до правок результата — «выпал максимум» это про
   * натуральную кость. Ждёт степеней: глитч Shadowrun — единиц больше
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

/**
 * Бросок целиком: заявка → правки заявки → кости → правки результата →
 * чтение. Правки приезжают записями словаря системы; движок не знает
 * ни одного их имени — только примитивы, из которых они собраны.
 */
export function rollLead(def: DieConstant, die: Die, edits: RollEdit[] = []): LeadRoll {
  const claim = applyClaimEdits(claimOf(def), edits);

  const entries: RolledDie[] = [];
  for (const term of claim.dice) {
    const count = term.count ?? 1;
    if (typeof count !== 'number') {
      throw new EngineError(
        `счёт костей «${def.label || '?'}» — неразрешённая ссылка; сперва unfoldDice`);
    }
    for (let i = 0; i < count; i++) {
      entries.push({
        value: die(term.sides), sides: term.sides,
        ...(term.name ? { name: String(term.name) } : {}),
      });
    }
  }

  // Счёт по натуральному броску снимается до правок результата: взрыв
  // выносит значение за грани, и «выпал максимум» после него уже не прочесть.
  const tally = tallyOf(entries);

  const grown = applyResultEdits(entries, edits, die);
  const { total, kept } = applyReading(keptDice(grown, claim.keep), claim.read);

  // Именованные части — по выросшим костям: взорвавшаяся Надежда должна быть
  // видна той величиной, которой она пошла в total.
  const parts: Record<string, number> = {};
  for (const entry of grown) {
    if (entry.name) parts[entry.name] = (parts[entry.name] ?? 0) + entry.value;
  }

  return {
    rolls: grown.map(e => e.value),
    kept, total, parts,
    edits: edits.map(e => e.label || '').filter(Boolean),
    versusShift: claim.versusShift,
    read: claim.read.kind,
    tally,
  };
}

function tallyOf(entries: RolledDie[]) {
  return {
    dice: entries.length,
    atMax: entries.filter(e => e.value === e.sides).length,
    atMin: entries.filter(e => e.value === 1).length,
  };
}
