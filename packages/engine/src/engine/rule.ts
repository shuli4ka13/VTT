// Ядро правил: общий цикл над цепочкой шагов. Конкретных типов шагов ядро
// не знает — модуль шага достаётся из реестра (src/engine/steps/index.js),
// и тест-сканер следит, чтобы здесь не завелось ни одного имени типа.
//
// Правило исполняется в две фазы, разрезанные конвертом:
//
//   packRule    — сторона ОТПРАВИТЕЛЯ. Каждый шаг бросает свои кости и считает
//                 свои выражения; всё, что относится к цели, остаётся в данных
//                 нетронутым. Итог — чистые данные, их и штампуют в конверт.
//
//   resolveRule — сторона ПОЛУЧАТЕЛЯ. Шаги досчитываются его формулами по его
//                 системе и применяются к его чарнику. Любой шаг может оборвать
//                 цепочку; каждый шаг оставляет запись трассировки — ВСЕГДА,
//                 это то, чем непрограммист заменяет отладчик.
//
// Изменения чарника идут только через ctx.write/ctx.attach ядра: шаги сами
// чарник не трогают, поэтому журнал изменений полон по построению.

import { stepModule } from './steps/index.ts';
import { findField } from './calc.ts';
import { requireEffect, stackingOf, usesMax } from './effects.ts';
import { EngineError } from './errors.ts';
import type { StepContext, StepData } from './steps/index.ts';
import type { Effect, Sheet, WornEffect } from '../model/types.ts';

/** Одно изменение поля: журнал полон по построению — шаги пишут только через ctx.write. */
export interface Change { tag: string; from: unknown; to: unknown }

export interface StopReason { step: string | number; type: string; reason?: string }

export interface RuleReport {
  sheet: Sheet;
  changes: Change[];
  /** Наложенные эффекты (факт, а не счёт наложений). */
  effects: string[];
  removed: string[];
  results: Record<string, unknown>;
  trace: Record<string, unknown>[];
  stopped: StopReason | null;
}

export function packRule(rule: Effect, ctx: StepContext): StepData[] {
  const packed: StepData[] = [];
  const stepCtx = { ...ctx, paramDefs: rule.params || [] };
  for (const step of rule.steps || []) {
    const mod = stepModule(step.type);
    packed.push({ type: step.type, id: step.id ?? null, ...mod.pack(step, stepCtx) } as StepData);
  }
  return packed;
}

export function resolveRule(steps: StepData[], ctx: StepContext): RuleReport {
  const values: Record<string, unknown> = { ...ctx.sheet.values };
  const worn: WornEffect[] = [...(ctx.sheet.effects || [])];
  const changes: Change[] = [];
  const effects: string[] = [];
  const removed: string[] = [];
  const results: Record<string, unknown> = {};
  const trace: Record<string, unknown>[] = [];
  let stopped: StopReason | null = null;

  const read = (tag: string): unknown => {
    if (Object.prototype.hasOwnProperty.call(values, tag)) return values[tag];
    const field = findField(ctx.system, tag);
    if (!field) throw new EngineError(`система не объявляет поля «${tag}» — читать нечего`);
    return field.value.kind === 'stored' ? field.value.default : undefined;
  };

  const write = (tag: string, to: unknown): void => {
    changes.push({ tag, from: read(tag), to });
    values[tag] = to;
  };

  // Что делать при повторном наложении ТОГО ЖЕ эффекта, решает сам эффект
  // (ось «стакинг»), а не шаг: «Отравлен» обновляется, «Шипы» копятся,
  // «Каменная кожа» второй раз ничего не делает.
  const attach = (effectId: string): void => {
    const effect = requireEffect(ctx.system, effectId, who(ctx));
    const at = worn.findIndex(e => e.effectId === effectId);
    const fresh: WornEffect = { effectId };
    const max = usesMax(effect);
    if (max !== null) fresh.usesLeft = max;

    if (at < 0) worn.push(fresh);
    else if (stackingOf(effect) === 'refresh') worn[at] = fresh;
    else if (stackingOf(effect) === 'stack') worn.push(fresh);
    else return; // ignore — уже висит, второй раз ничего не делает
    // Журналу нужен факт «эффект наложен», а не счёт наложений: две одинаковые
    // строки подряд читаются как ошибка, хотя это одно и то же состояние.
    if (!effects.includes(effectId)) effects.push(effectId);
  };

  const detach = (effectId: string): void => {
    requireEffect(ctx.system, effectId, who(ctx));
    const before = worn.length;
    for (let i = worn.length - 1; i >= 0; i--) {
      if (worn[i]!.effectId === effectId) worn.splice(i, 1);
    }
    if (worn.length !== before) removed.push(effectId);
  };

  const stepCtx = { ...ctx, results, read, write, attach, detach };

  for (const [index, step] of steps.entries()) {
    const mod = stepModule(step.type);
    const out = mod.resolve(step, stepCtx);
    const name = step.id ?? index;
    trace.push({ step: name, type: step.type, ...out.trace });
    if (step.id != null) results[step.id] = out.value;
    if (out.break) {
      stopped = { step: name, type: step.type, reason: out.break.reason };
      break;
    }
  }

  const touched = changes.length || effects.length || removed.length;
  const sheet = touched ? { ...ctx.sheet, values, effects: worn } : ctx.sheet;
  return { sheet, changes, effects, removed, results, trace, stopped };
}

const who = (ctx: StepContext): string => ctx.owner || 'правило';
