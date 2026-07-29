// Движок вычислений. Единственное место в программе, которое умеет считать.
//
// Ни система, ни чарник считать не умеют — они данные. Система хранит формулу
// как текст, чарник хранит значения. Способность вычислять одна на всю программу
// и лежит здесь.
//
// Движок не знает ни одного конкретного имени стата. В этом файле не должно
// появиться ни «str», ни «hp», ни «ac» — иначе новый стат перестанет добавляться
// правкой данных (критерий приёмки №3).
//
// Проход (`pass`) — контекст одного пересчёта: мемоизация, стек для ловли циклов,
// журнал вычисленного. Разные проходы кэш не делят: иначе правка чарника
// не была бы видна.

import { compile } from '../formula/index.js';
import { UnknownTagError, CycleError, EngineError } from './errors.js';
import { lookupTable } from './tables.js';
import { collectModifiers, applyValueModifiers } from './modifiers.js';

export function findField(system, tag) {
  return system.fields.find(f => f.tag === tag) || null;
}

export function newPass(system, sheet, options = {}) {
  const pass = {
    system,
    sheet,
    memo: new Map(),
    visiting: new Set(),
    path: [],
    computed: [],
    modifiers: null,
  };

  // Единая точка входа для всего, что должно спросить значение тега:
  // формулы полей, условия модификаторов, аргументы таблиц. Все они идут
  // через один и тот же проход, поэтому делят мемоизацию и ловлю циклов.
  pass.resolve = tag => calc(system, sheet, tag, pass);

  // Модификаторы собираются один раз на проход, а не на каждое поле.
  if (options.compendium) pass.modifiers = collectModifiers(system, sheet, options.compendium);
  else if (options.modifiers) pass.modifiers = options.modifiers;

  return pass;
}

export function calc(system, sheet, tag, pass = newPass(system, sheet)) {
  const field = findField(system, tag);
  if (!field) throw new UnknownTagError(tag, pass.path[pass.path.length - 1]);

  if (pass.memo.has(tag)) return pass.memo.get(tag);
  if (pass.visiting.has(tag)) throw new CycleError([...pass.path, tag]);

  pass.visiting.add(tag);
  pass.path.push(tag);
  try {
    const value = applyValueModifiers(computeBase(field, pass), tag, pass);
    pass.memo.set(tag, value);
    pass.computed.push(tag);
    return value;
  } finally {
    pass.visiting.delete(tag);
    pass.path.pop();
  }
}

export function calcAll(system, sheet, pass = newPass(system, sheet)) {
  const out = {};
  for (const field of system.fields) out[field.tag] = calc(system, sheet, field.tag, pass);
  return out;
}

// Список тегов, от которых поле зависит напрямую. Нужен интерфейсу для чипсов
// и — в продакшне — инкрементальному пересчёту по графу.
export function dependenciesOf(system, tag) {
  const field = findField(system, tag);
  if (!field) throw new UnknownTagError(tag);
  const source = field.value;
  if (source.kind === 'formula') return [...compile(source.expr).deps];
  if (source.kind === 'table') return [...compile(source.arg).deps];
  return [];
}

function computeBase(field, pass) {
  const source = field.value;
  const resolve = tag => calc(pass.system, pass.sheet, tag, pass);

  switch (source.kind) {
    case 'stored':
      return readStored(pass.sheet, field);

    case 'formula':
      return compile(source.expr).evaluate(resolve);

    case 'table':
      return lookupTable(pass.system, source.table, compile(source.arg).evaluate(resolve), field.tag);

    default:
      throw new EngineError(`поле «${field.tag}»: неизвестный способ получить значение «${source.kind}»`);
  }
}

function readStored(sheet, field) {
  const values = sheet.values || {};
  if (Object.prototype.hasOwnProperty.call(values, field.tag)) return values[field.tag];
  return field.value.default;
}
