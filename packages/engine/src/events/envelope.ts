// Событийный конверт.
//
// Отправитель собирает КОНВЕРТ НАМЕРЕНИЯ и отправляет. Он не считает ничего
// за получателя: эффект его системы упаковывается фазой pack — свои броски
// и свои выражения уезжают числами, всё целевое (теги, выражения цели,
// результаты шагов) остаётся в данных нетронутым.
//
// Получатель распаковывает, досчитывает своими формулами по своей системе
// (фаза resolve) и применяет к себе. Возвращается НОВЫЙ чарник — исходный
// не мутируется.
//
// Самого конвейера этот модуль не знает: цепочку шагов крутит ядро
// (src/engine/rule.js), типы шагов живут за реестром. Здесь только граница
// между записью компендиума и эффектом системы:
//
//   запись (компендиум)  →  привязка  →  эффект (система)
//   «Длинный меч»           «Атака»       шаги, одно определение на всех
//   циферки: кость урона    args          правка меняет все записи сразу
//
// И вторая граница — ответка: после разрешения события у получателя могут
// сработать его ТРИГГЕРНЫЕ эффекты. Ответ уезжает обычным конвертом
// в обратную сторону, и считает его снова получатель, то есть исходный
// отправитель. Принцип «отправитель не считает за получателя» не тронут.

import { newPass } from '../engine/calc.ts';
import { packRule, resolveRule } from '../engine/rule.ts';
import { resolveRef } from '../engine/refs.ts';
import {
  requireEffect, findEffect, isPipeline, activationOf, durationOf, wornEffects,
} from '../engine/effects.ts';
import { EngineError } from '../engine/errors.ts';
import type {
  System, Sheet, Compendium, CompendiumRecord, Binding, Die,
} from '../model/types.ts';
import type { StepData } from '../engine/steps/index.ts';
import type { RefContext } from '../engine/refs.ts';

/** Что персонаж может применить: пара «запись · привязка», собранная на лету. */
export interface Action {
  id: string;
  label: string;
  record: CompendiumRecord;
  binding: Binding;
  effect: string;
}

/** Контекст мира: чем считать и по каким данным. */
export interface WorldContext {
  system: System;
  compendium: Compendium;
  die: Die;
}

/** Конверт намерения. Отправитель НЕ считает за получателя — это критерий №5. */
export interface Envelope {
  kind: string;
  effect: string;
  from: string;
  to?: string;
  action: string;
  label: string;
  steps: StepData[];
  /** Конверт рождён триггером: на помеченные триггеры молчат (каскад глубины 1). */
  reply?: boolean;
}

export interface Report {
  kind: string;
  effect: string;
  from: string;
  label: string;
  reply: boolean;
  trace: Record<string, unknown>[];
  stopped: unknown;
  changes: unknown[];
  effects: string[];
  removed: string[];
  spent: string[];
}

export interface ReceiveResult {
  sheet: Sheet;
  replies: Envelope[];
  report: Report;
}

// ── что персонаж может применить ────────────────────────────────────────────

// Привязки записи — что она даёт владельцу. Три источника, и порядок важен:
// СВОЯ активность записи перебивает привязку рода. Так штучная вещь получает
// поведение поверх общей формы, не ломая форму.
export function bindingsOf(record: CompendiumRecord, system: System): Binding[] {
  if (record.activities && record.activities.length) return record.activities;
  if (record.effect) return [{ label: record.label, effect: String(record.effect), args: (record.args || {}) as Binding['args'] }];
  const decl = (system.records || {})[String(record.rk)];
  return decl?.bindings || [];
}

// Выученные записи-действия ПЛЮС привязки надетых предметов. Как в Foundry:
// у меча есть своя атака, надел — получил, снял — потерял. Причём мечу
// не нужно её объявлять: привязка живёт у РОДА «Оружие», а запись заполняет
// только кость урона.
export function availableActions(
  sheet: Sheet, { system, compendium }: { system: System; compendium: Compendium },
): Action[] {
  const out: Action[] = [];

  for (const itemId of sheet.equipped || []) {
    const item = (compendium.items || []).find(i => i.id === itemId);
    if (item) out.push(...actionsOfRecord(item, system, true));
  }

  for (const actionId of (sheet.actions as string[] | undefined) || []) {
    const record = (compendium.actions || []).find(a => a.id === actionId);
    if (record) out.push(...actionsOfRecord(record, system, false));
  }

  return out;
}

// Действие по id — «запись:номер привязки». Виртуальное, нигде не хранится:
// источник правды один, сама запись.
export function actionOf(
  actionId: string, { system, compendium }: { system: System; compendium: Compendium },
): Action {
  const at = String(actionId).lastIndexOf(':');
  const recordId = at > 0 ? String(actionId).slice(0, at) : String(actionId);
  const index = at > 0 ? Number(String(actionId).slice(at + 1)) : 0;

  const item = (compendium.items || []).find(r => r.id === recordId);
  const record = item || (compendium.actions || []).find(r => r.id === recordId);
  if (!record) throw new EngineError(`в компендиуме нет записи «${recordId}»`);

  const action = actionsOfRecord(record, system, Boolean(item))[index];
  if (!action) {
    throw new EngineError(
      `запись «${record.label}» (${recordId}) не даёт действия №${index}: ` +
      'ни своей активности, ни привязки у её рода');
  }
  return action;
}

// Предмет всегда называется парой «вещь · применение»: у одного меча может
// быть и удар, и парирование. Запись-действие сама себе имя, пока привязка
// одна, — «Ядовитые брызги», а не «Ядовитые брызги · Сотворить».
function actionsOfRecord(record: CompendiumRecord, system: System, fromItem: boolean): Action[] {
  const bindings = bindingsOf(record, system);
  return bindings.map((binding, index): Action => ({
    id: `${record.id}:${index}`,
    label: fromItem || bindings.length > 1
      ? `${record.label} · ${binding.label || 'Применение'}`
      : String(record.label),
    record,
    binding,
    effect: binding.effect,
  }));
}

// ── отправка ────────────────────────────────────────────────────────────────

export function send(
  actionId: string,
  { system, sheet, compendium, die }: WorldContext & { sheet: Sheet },
): Envelope {
  const action = actionOf(actionId, { system, compendium });

  // Эффект достаётся из СИСТЕМЫ отправителя в момент отправки: правка эффекта
  // меняет поведение всех записей сразу, записи нечего кэшировать.
  const effect = requireEffect(system, action.effect, `действие «${action.label}»`);
  if (!isPipeline(effect)) {
    throw new EngineError(
      `действие «${action.label}» зовёт эффект «${effect.label || action.effect}», ` +
      'а он пассивный: у пассивного конвейера шагов нет, его вешают, а не применяют');
  }

  const pass = newPass(system, sheet, { compendium });
  const steps = packRule(effect, {
    system, sheet, pass, die,
    params: action.binding.args || {},
    props: propsOf(action.record, system),
    owner: `эффект «${effect.label || action.effect}»`,
  });

  return {
    kind: 'effect',
    effect: action.effect,
    from: sheet.id,
    action: action.id,
    label: action.label,
    steps,
  };
}

// ── получение ───────────────────────────────────────────────────────────────

export function receive(
  envelope: Envelope,
  { system, sheet, compendium, die }: WorldContext & { sheet: Sheet },
): ReceiveResult {
  const pass = newPass(system, sheet, { compendium });
  const out = resolveRule(envelope.steps || [], {
    system, sheet, pass, die,
    owner: `конверт «${envelope.label}»`,
  });

  // Ответка не будит ответку: конверт, рождённый триггером, помечен, и на
  // помеченные триггеры молчат. Без этого два шипастых обменивались бы
  // уроном бесконечно. Аналог из 5e — «одна реакция в раунд».
  const fired = envelope.reply
    ? { sheet: out.sheet, replies: [], spent: [] }
    : fireTriggers(envelope, out, { system, compendium, die });

  return {
    sheet: fired.sheet,
    replies: fired.replies,
    report: {
      kind: envelope.kind,
      effect: envelope.effect,
      from: envelope.from,
      label: envelope.label,
      reply: envelope.reply === true,
      trace: out.trace,
      stopped: out.stopped,
      changes: out.changes,
      effects: out.effects,
      removed: out.removed,
      spent: fired.spent,
    },
  };
}

// Триггеры получателя: событие уже разрешено и посчитано, теперь эффекты,
// висящие на нём, отвечают. Каждый ответ — обычный конверт в обратную
// сторону; считать его будет исходный отправитель, у себя и своей системой.
function fireTriggers(
  envelope: Envelope, out: { sheet: Sheet; results: Record<string, unknown> }, { system, compendium, die }: WorldContext,
): { sheet: Sheet; replies: Envelope[]; spent: string[] } {
  const replies: Envelope[] = [];
  const spent: string[] = [];
  let sheet = out.sheet;

  // Список снимается ДО правок: срабатывание может убрать запись с листа
  // (счётчик дошёл до нуля), и перебирать живой массив нельзя.
  const candidates = wornEffects(system, sheet, { strict: false })
    .filter(({ effect }) => activationOf(effect) === 'triggered');

  for (const { id, effect } of candidates) {
    const trigger = effect.trigger;
    if (!trigger) continue;
    if (trigger.on !== envelope.effect) continue;
    if ((trigger.when || 'resolved') !== 'resolved') continue;

    const pass = newPass(system, sheet, { compendium });
    const owner = `триггер «${effect.label || id}»`;
    if (!conditionHolds(trigger.condition, { pass, results: out.results, owner })) continue;

    replies.push({
      kind: 'effect',
      effect: id,
      from: sheet.id,
      to: envelope.from,
      reply: true,
      action: id,
      label: effect.label || id,
      steps: packRule(effect, {
        system, sheet, pass, die,
        params: (effect.args || {}) as Record<string, unknown>,
        props: null,
        owner,
      }),
    });

    if (durationOf(effect) === 'uses') {
      sheet = spendUse(sheet, id);
      spent.push(id);
    }
  }

  return { sheet, replies, spent };
}

// Условие триггера — структурная ссылка, как слоты шагов: { ref: 'hit.success' }
// смотрит в результат шага СОБЫТИЯ, { expr } — в поля самого владельца.
// Пусто — срабатывает всегда.
function conditionHolds(condition: unknown, ctx: RefContext): boolean {
  if (condition === null || condition === undefined) return true;
  const value = resolveRef(condition, ctx);
  if (typeof value !== 'boolean') {
    throw new EngineError(
      `${ctx.owner}: условие должно давать логическое значение, а дало ${JSON.stringify(value)}`);
  }
  return value;
}

// Счётчик срабатываний — личное число персонажа: у варвара осталось два,
// у жреца три. Потому и живёт в записи на листе, а не в эффекте.
export function spendUse(sheet: Sheet, effectId: string): Sheet {
  const effects: Sheet['effects'] = [];
  for (const entry of sheet.effects || []) {
    if (entry.effectId !== effectId) { effects.push(entry); continue; }
    const left = Number(entry.usesLeft ?? 1) - 1;
    if (left > 0) effects.push({ ...entry, usesLeft: left });
  }
  return { ...sheet, effects };
}

// ── свойства записи-источника ───────────────────────────────────────────────

// Из записи читаются ТОЛЬКО свойства, объявленные системой для её РОДА
// (system.records[rk].props). Необъявленного свойства для движка не существует:
// компендиум ничего нового не вводит, он заполняет объявленное.
export function propsOf(record: CompendiumRecord, system: System): Record<string, unknown> | null {
  const decl = (system.records || {})[String(record.rk)];
  if (!decl?.props || !decl.props.length) return null;
  const props: Record<string, unknown> = {};
  for (const p of decl.props) {
    if (record.props && record.props[p.key] !== undefined) props[p.key] = record.props[p.key];
  }
  return props;
}

// Лейбл эффекта для журнала: журнал показывает человеческое имя, а хранится
// всюду машинный id.
export const effectLabelOf = (system: System, id: string): string => {
  const effect = findEffect(system, id);
  return (effect && effect.label) || id;
};
