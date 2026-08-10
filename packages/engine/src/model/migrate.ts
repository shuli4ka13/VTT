// Миграция мира со старого формата на новый. Одноразовое преобразование
// данных, не слой совместимости: после неё в мире нет ни `system.rules`,
// ни `system.modifiers`, ни полки `compendium.effects` — движок читает
// один формат, и второго кода на второй формат в нём нет.
//
// Что было и во что превращается:
//
//   system.rules[id]              → system.effects[id], активируемый
//   system.modifiers[]            → system.effects[id], пассивный + room_rules
//   compendium.effects, длящиеся  → system.effects[id], пассивный, временный
//   compendium.effects, вызовы    → РАСТВОРЯЮТСЯ: их параметры переезжают
//                                    в привязку записи, которая их звала
//
// Вызов был лишним звеном: запись → вызов → правило. Теперь запись ссылается
// на эффект напрямую и несёт аргументы сама, поэтому промежуточная запись
// исчезает, а не переименовывается.

import type { World, Effect, RecordKind, Binding, Modifier } from './types.ts';

/** Мир старого формата читается свободно: его формы уже не существует. */
type Legacy = Record<string, any>;

const isCall = (record: Legacy) => Boolean(record && record.rule);

export function needsMigration(world: Legacy): boolean {
  const system = world.system || {};
  const compendium = world.compendium || {};
  return Boolean(system.rules || system.modifiers || compendium.effects);
}

export function migrateWorld(world: Legacy): World {
  if (!needsMigration(world)) return world as World;

  const system: Legacy = { ...world.system };
  const compendium: Legacy = { ...world.compendium };
  const effects: Record<string, Effect> = { ...(system.effects || {}) };
  const roomRules: string[] = [...(system.room_rules || [])];

  // 1. Правила-конвейеры становятся активируемыми эффектами: та же цепочка
  //    шагов, тот же id — ссылки на них не рвутся.
  for (const [id, rule] of Object.entries<Legacy>(system.rules || {})) {
    effects[id] = {
      label: rule.label || id,
      icon: '⚙',
      category: 'Механики',
      activation: 'manual',
      cost: 'action',
      params: rule.params || [],
      steps: rule.steps || [],
    };
  }

  // 2. Правила комнаты были голыми модификаторами в отдельной секции.
  //    Теперь это обычные пассивные эффекты, просто включённые на всех.
  for (const [index, mod] of (system.modifiers as Legacy[] || []).entries()) {
    const id = mod.id || `room_rule_${index + 1}`;
    const { id: _drop, label, ...payload } = mod;
    effects[id] = {
      label: label || 'Правило комнаты',
      icon: '⚖',
      category: 'Правила комнаты',
      activation: 'passive',
      duration: { kind: 'permanent' },
      modifiers: [payload as Modifier],
    };
    if (!roomRules.includes(id)) roomRules.push(id);
  }

  // 3. Длящиеся эффекты компендиума переезжают в систему как пассивные.
  const calls = new Map<string, Legacy>();
  for (const record of (compendium.effects as Legacy[]) || []) {
    if (isCall(record)) { calls.set(record.id, record); continue; }
    effects[record.id] = {
      label: record.label || record.id,
      icon: record.icon || '✦',
      category: 'Состояния',
      activation: 'passive',
      duration: { kind: 'temporary' },
      description: record.description || '',
      modifiers: record.modifiers || [],
    };
  }

  system.effects = effects;
  system.room_rules = roomRules;
  delete system.rules;
  delete system.modifiers;

  // 4. Рода «вызов правила» и «эффект» описывали полку компендиума, которой
  //    больше нет. Записи этих родов уже переехали в библиотеку эффектов.
  system.records = Object.fromEntries(
    Object.entries<RecordKind>(system.records || {}).filter(([, decl]) => !['call', 'effect'].includes(decl.kind)));

  // 5. Ссылки на вызовы разворачиваются в прямые: эффект плюс аргументы.
  compendium.items = ((compendium.items as Legacy[]) || []).map((item: Legacy) => ({
    ...item,
    activities: ((item.activities as Legacy[]) || []).map((act: Legacy) => resolveCall(act, calls)),
  }));
  compendium.actions = ((compendium.actions as Legacy[]) || []).map((action: Legacy) => {
    const call = calls.get(action.effect);
    if (!call) return action;
    return { ...action, effect: call.rule, args: call.params || {} };
  });
  delete compendium.effects;

  return { ...world, system, compendium, sheets: world.sheets } as World;
}

function resolveCall(activity: Legacy, calls: Map<string, Legacy>): Binding {
  const call = calls.get(activity.effect);
  if (!call) return activity as Binding;
  return { label: activity.label, effect: call.rule, args: call.params || {} };
}
