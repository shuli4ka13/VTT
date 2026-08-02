// Реестр типов шагов. ЕДИНСТВЕННОЕ место, которое знает конкретные типы.
//
// Ядро (src/engine/rule.js) крутит общий цикл и спрашивает модуль по имени —
// ветвлений по типу в нём нет, и тест-сканер в tests/rule.steps.test.js
// следит, чтобы не появились. Добавление нового типа шага — один новый модуль
// и одна строка здесь; ни ядро, ни другие шаги не правятся.
//
// Контракт модуля шага:
//   type    — машинное имя, оно же лежит в данных правила
//   label   — человеческое имя для конструктора
//   slots   — схема слотов: из неё конструктор выводит форму карточки
//   pack(step, ctx)    — сторона ОТПРАВИТЕЛЯ: свои броски, свои выражения;
//                        возвращает чистые данные для конверта
//   resolve(step, ctx) — сторона ПОЛУЧАТЕЛЯ: теги цели, применение;
//                        возвращает { value, trace, break? } — trace ВСЕГДА

import { EngineError } from '../errors.js';
import * as threshold from './threshold.js';
import * as amount from './amount.js';
import * as compare from './compare.js';
import * as apply from './apply.js';
import * as status from './status.js';

export const registry = new Map();

export function registerStepType(mod) {
  for (const part of ['type', 'pack', 'resolve']) {
    if (!mod || mod[part] === undefined) {
      throw new EngineError(
        `тип шага «${mod && mod.type ? mod.type : '?'}» не годится в реестр: не хватает «${part}»`);
    }
  }
  registry.set(mod.type, mod);
  return mod;
}

for (const mod of [threshold, amount, compare, apply, status]) registerStepType(mod);

export function stepModule(type) {
  const mod = registry.get(type);
  if (!mod) {
    throw new EngineError(
      `неизвестный тип шага «${type}» — реестр знает: ${[...registry.keys()].join(', ')}`);
  }
  return mod;
}
