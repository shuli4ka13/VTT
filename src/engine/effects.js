// Чтение библиотеки эффектов. Единственное место, которое знает, как устроена
// секция `system.effects` и по каким умолчаниям читаются её необязательные оси.
//
// Система = поля + БИБЛИОТЕКА ЭФФЕКТОВ + список включённых на всех
// (`system.room_rules`). Эффект — данные; способность их исполнять живёт
// в src/engine/rule.js, способность собрать из них модификаторы —
// в src/engine/modifiers.js. Здесь только чтение и классификация.
//
// Способ подключения внутри эффекта НЕ записан: один и тот же эффект можно
// включить в правила комнаты, повесить на один чарник или привязать к роду
// записи компендиума. Знает об этом тот, кто подключил, а не эффект.

import { EngineError } from './errors.js';

const PIPELINE_ACTIVATIONS = ['manual', 'triggered'];
const ACTIVATIONS = [...PIPELINE_ACTIVATIONS, 'passive'];
const DURATIONS = ['permanent', 'temporary', 'uses'];
const STACKINGS = ['ignore', 'refresh', 'stack'];

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

export const activationOf = effect => pick(effect && effect.activation, ACTIVATIONS, 'manual');

export const durationOf = effect =>
  pick(effect && effect.duration && effect.duration.kind, DURATIONS, 'permanent');

export const stackingOf = effect => pick(effect && effect.stacking, STACKINGS, 'ignore');

// Активируемый и триггерный несут конвейер шагов, пассивный — модификаторы.
export const isPipeline = effect => PIPELINE_ACTIVATIONS.includes(activationOf(effect));

export const effectsOf = system => Object.entries(system.effects || {});

export const findEffect = (system, id) => (system.effects || {})[id] || null;

// Строгий вариант: движок обязан ругаться внятно, а не падать на undefined.
export function requireEffect(system, id, who) {
  const effect = findEffect(system, id);
  if (!effect) {
    throw new EngineError(
      `${who}: система не объявляет эффекта «${id}» — библиотека знает: ${
        effectsOf(system).map(([key]) => key).join(', ') || '(пусто)'}`);
  }
  return effect;
}

// Максимум счётчика срабатываний. Сам остаток — личное число персонажа
// и живёт в его записи на листе (`usesLeft`), а не здесь: эффект общий закон.
export function usesMax(effect) {
  if (durationOf(effect) !== 'uses') return null;
  const max = Number(effect.duration.max);
  return Number.isFinite(max) && max > 0 ? Math.floor(max) : 1;
}

// ── подключённые эффекты ────────────────────────────────────────────────────
// Три способа подключения, и все три перечисляются здесь, чтобы ни движок,
// ни интерфейс не собирали этот список у себя заново.

// Правила комнаты: пассивные эффекты, включённые на ВСЕХ чарников мира.
// Здесь лежат только ССЫЛКИ на эффекты той же библиотеки — отдельной породы
// «правило комнаты» не существует, охват не свойство эффекта.
export function roomEffects(system) {
  const out = [];
  for (const id of system.room_rules || []) {
    const effect = findEffect(system, id);
    if (!effect) continue; // висячая ссылка — приговор конструктора, не крах стола
    out.push({ id, effect });
  }
  return out;
}

// ── запросы «кто на это ссылается» ──────────────────────────────────────────
// Нужны конструктору, чтобы не дать удалить мишень или поле, на которые
// кто-то смотрит. Собирать этот список у себя каждому экрану нельзя:
// забытое место означало бы разрешённое удаление и висячую ссылку.

export const allModifiers = (system, compendium = {}) => [
  ...effectsOf(system).flatMap(([, effect]) => effect.modifiers || []),
  ...(compendium.items || []).flatMap(record => record.modifiers || []),
];

export const allSteps = system =>
  effectsOf(system).flatMap(([, effect]) => effect.steps || []);

// Эффекты, висящие на конкретном чарнике. Запись листа — ссылка плюс скаляры
// (`usesLeft`), поэтому round-trip чарника (критерий №1) не меняется.
export function wornEffects(system, sheet, { strict = true } = {}) {
  const out = [];
  for (const entry of sheet.effects || []) {
    const effect = findEffect(system, entry.effectId);
    if (!effect) {
      if (!strict) continue;
      throw new EngineError(
        `на чарнике «${sheet.id}» висит эффект «${entry.effectId}», которого система не объявляет`);
    }
    out.push({ id: entry.effectId, effect, entry });
  }
  return out;
}
