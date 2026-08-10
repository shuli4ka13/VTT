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

import { EngineError } from '../errors.ts';
import * as threshold from './threshold.ts';
import * as amount from './amount.ts';
import * as compare from './compare.ts';
import * as apply from './apply.ts';
import * as status from './status.ts';
import type { Step, System, Sheet, Die } from '../../model/types.ts';
import type { RefContext } from '../refs.ts';

/**
 * Данные шага, как они лежат в системе. У каждого типа слоты свои, и точную
 * форму задаёт `slots` его модуля; здесь тип нарочно широкий — модуль читает
 * ровно те слоты, которые сам же и объявил. Проверку формы даёт схема мира
 * (packages/schema) на входе, а не движок на каждом обращении.
 */
export type StepData = Step & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Контекст исполнения шага: контекст ссылок плюс то, чем шаг бросает и считает. */
export interface StepContext extends RefContext {
  system: System;
  sheet: Sheet;
  die: Die;
  /** Доступ к листу ПОЛУЧАТЕЛЯ: единственный шаг, который пишет, — «применить». */
  read?: (tag: string) => unknown;
  write?: (tag: string, value: unknown) => void;
  /** Навесить и снять эффект — шаг «состояние»; стакинг решает ядро. */
  attach?: (id: string) => void;
  detach?: (id: string) => void;
  [k: string]: unknown;
}

/** Что шаг вернул получателю: значение, запись трассы и, может быть, обрыв цепочки. */
export interface StepResult {
  value?: unknown;
  /** Трасса возвращается ВСЕГДА — ею непрограммист заменяет отладчик. */
  trace?: Record<string, unknown>;
  /** Цепочка обрывается: порог не взят, сравнение не дотянуло. */
  break?: { reason?: string } | null;
  [k: string]: unknown;
}

/**
 * Модуль типа шага. Ядро (engine/rule.ts) знает только этот контракт —
 * ветвлений по конкретному типу в нём нет, и сканер в тестах следит,
 * чтобы не появились.
 */
export interface StepModule {
  type: string;
  label?: string;
  /** Схема слотов: из неё конструктор выводит форму карточки. */
  slots?: unknown;
  outputs?: unknown;
  /** Сторона ОТПРАВИТЕЛЯ: свои броски и выражения → чистые данные для конверта. */
  pack(step: StepData, ctx: StepContext): Record<string, unknown>;
  /** Сторона ПОЛУЧАТЕЛЯ: теги цели, применение. Трасса возвращается ВСЕГДА. */
  resolve(step: StepData, ctx: StepContext): StepResult;
  lint?: (...args: never[]) => unknown;
  traceLine?: (...args: never[]) => unknown;
  [k: string]: unknown;
}

export const registry = new Map<string, StepModule>();

export function registerStepType(mod: StepModule): StepModule {
  for (const part of ['type', 'pack', 'resolve']) {
    if (!mod || (mod as Record<string, unknown>)[part] === undefined) {
      throw new EngineError(
        `тип шага «${mod && mod.type ? mod.type : '?'}» не годится в реестр: не хватает «${part}»`);
    }
  }
  registry.set(mod.type, mod);
  return mod;
}

for (const mod of [threshold, amount, compare, apply, status]) {
  registerStepType(mod as unknown as StepModule);
}

export function stepModule(type: string): StepModule {
  const mod = registry.get(type);
  if (!mod) {
    throw new EngineError(
      `неизвестный тип шага «${type}» — реестр знает: ${[...registry.keys()].join(', ')}`);
  }
  return mod;
}
