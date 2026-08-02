// Шаг «применить» — ЕДИНСТВЕННЫЙ способ что-либо менять на чарнике цели.
//
// Слоты: мишень (тег хранимого поля), направление (плюс/минус/присвоить),
// величина, границы (пол и потолок), применять ли модификаторы цели.
//
// Правило не знает слова «урон». Урон, лечение, износ брони, трата ресурса —
// это разные заполнения ЭТИХ слотов:
//   урон:    subtract, пол 0, targetModifiers: true  (сопротивления цели)
//   лечение: add, потолок — тег максимума хитов, targetModifiers: false
//   износ:   subtract 1 из прочности, пол 0, без модификаторов
//
// Модификаторы цели — это мишень «входящее» (incoming:тег): сопротивление
// половинит, уязвимость удваивает. Результат округляется ВНИЗ — соглашение
// движка, записано в docs/production-differences.md.

import { findField } from '../calc.js';
import { applyValueModifiers } from '../modifiers.js';
import { incomingTagOf } from '../targets.js';
import { packRef, resolveNumber, resolveRef } from '../refs.js';
import { EngineError } from '../errors.js';

export const type = 'apply';
export const label = 'Применить';
export const hint = 'Изменить поле цели. Единственный шаг, который что-то меняет.';

const DIRECTIONS = {
  add: (from, x) => from + x,
  subtract: (from, x) => from - x,
  set: (from, x) => x,
};

export const slots = [
  { key: 'target', label: 'Мишень', kind: 'tag' },
  { key: 'direction', label: 'Направление', kind: 'choice', options: Object.keys(DIRECTIONS) },
  { key: 'value', label: 'Величина', kind: 'ref' },
  { key: 'floor', label: 'Пол', kind: 'ref' },
  { key: 'ceiling', label: 'Потолок', kind: 'ref' },
  { key: 'targetModifiers', label: 'Модификаторы цели', kind: 'flag' },
];

export const outputs = [
  { path: '.amount', label: 'применено' },
];

export const mayBreak = false;

export function lint(step) {
  if (!step.target) return 'применению нужна мишень — тег хранимого поля цели';
  if (!step.value) return 'применению нужна величина — что именно менять';
  if (step.direction && !DIRECTIONS[step.direction]) {
    return `неизвестное направление «${step.direction}» — умею: ${Object.keys(DIRECTIONS).join(', ')}`;
  }
  return null;
}

export function traceLine(t, h) {
  const sign = t.direction === 'add' ? '+' : t.direction === 'subtract' ? '−' : '=';
  const mods = t.incoming !== t.amount
    ? ` (входящее ${t.incoming}, после модификаторов цели ${t.amount})`
    : '';
  return `применено: ${h.labelOf(t.target)} ${t.from} → ${t.to} (${sign}${t.amount})${mods}`;
}

export function pack(step, ctx) {
  const direction = step.direction || 'subtract';
  if (!DIRECTIONS[direction]) {
    throw new EngineError(
      `${ctx.owner || 'правило'}: неизвестное направление «${direction}» — умею: ${Object.keys(DIRECTIONS).join(', ')}`);
  }
  return {
    target: packRef(step.target, ctx),
    direction,
    value: packRef(step.value, ctx),
    floor: step.floor !== undefined ? packRef(step.floor, ctx) : null,
    ceiling: step.ceiling !== undefined ? packRef(step.ceiling, ctx) : null,
    targetModifiers: !!step.targetModifiers,
  };
}

export function resolve(step, ctx) {
  const tag = tagOf(step.target, ctx);
  assertWritable(ctx.system, tag);

  const incoming = resolveNumber(step.value, ctx, 'величина применения');
  const amount = step.targetModifiers
    ? Math.floor(applyValueModifiers(incoming, incomingTagOf(tag), ctx.pass))
    : incoming;

  const from = ctx.read(tag);
  if (typeof from !== 'number' && step.direction !== 'set') {
    throw new EngineError(
      `поле «${tag}» держит не число (${typeof from}) — прибавлять и вычитать нечего`);
  }

  const floor = step.floor == null ? null : resolveNumber(step.floor, ctx, 'пол применения');
  const ceiling = step.ceiling == null ? null : resolveNumber(step.ceiling, ctx, 'потолок применения');

  let to = DIRECTIONS[step.direction](from, amount);
  if (floor !== null && to < floor) to = floor;
  if (ceiling !== null && to > ceiling) to = ceiling;

  ctx.write(tag, to);

  return {
    value: { amount, from, to },
    trace: { target: tag, direction: step.direction, incoming, amount, from, to, floor, ceiling },
    break: null,
  };
}

// Мишень — тег, а не значение: { tag } или голая строка. Всё остальное —
// попытка целиться посчитанным числом, это бессмыслица.
function tagOf(ref, ctx) {
  if (typeof ref === 'string') return ref;
  if (ref && typeof ref === 'object' && 'tag' in ref) return ref.tag;
  const resolved = resolveRef(ref, ctx);
  if (typeof resolved === 'string') return resolved;
  throw new EngineError(
    `${ctx.owner || 'правило'}: мишень применения должна быть тегом, а пришло ${JSON.stringify(ref)}`);
}

function assertWritable(system, tag) {
  const field = findField(system, tag);
  if (!field) throw new EngineError(`система не объявляет поля «${tag}» — применять некуда`);
  if (field.value.kind !== 'stored') {
    throw new EngineError(
      `в поле «${tag}» нельзя писать: его считает движок по формуле, а не событие`);
  }
}
