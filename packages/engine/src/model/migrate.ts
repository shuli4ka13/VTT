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

const isCall = record => Boolean(record && record.rule);

export function needsMigration(world) {
  const system = world.system || {};
  const compendium = world.compendium || {};
  return Boolean(system.rules || system.modifiers || compendium.effects);
}

export function migrateWorld(world) {
  if (!needsMigration(world)) return world;

  const system = { ...world.system };
  const compendium = { ...world.compendium };
  const effects = { ...(system.effects || {}) };
  const roomRules = [...(system.room_rules || [])];

  // 1. Правила-конвейеры становятся активируемыми эффектами: та же цепочка
  //    шагов, тот же id — ссылки на них не рвутся.
  for (const [id, rule] of Object.entries(system.rules || {})) {
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
  for (const [index, mod] of (system.modifiers || []).entries()) {
    const id = mod.id || `room_rule_${index + 1}`;
    const { id: _drop, label, ...payload } = mod;
    effects[id] = {
      label: label || 'Правило комнаты',
      icon: '⚖',
      category: 'Правила комнаты',
      activation: 'passive',
      duration: { kind: 'permanent' },
      modifiers: [payload],
    };
    if (!roomRules.includes(id)) roomRules.push(id);
  }

  // 3. Длящиеся эффекты компендиума переезжают в систему как пассивные.
  const calls = new Map();
  for (const record of compendium.effects || []) {
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
    Object.entries(system.records || {}).filter(([, decl]) => !['call', 'effect'].includes(decl.kind)));

  // 5. Ссылки на вызовы разворачиваются в прямые: эффект плюс аргументы.
  compendium.items = (compendium.items || []).map(item => ({
    ...item,
    activities: (item.activities || []).map(act => resolveCall(act, calls)),
  }));
  compendium.actions = (compendium.actions || []).map(action => {
    const call = calls.get(action.effect);
    if (!call) return action;
    return { ...action, effect: call.rule, args: call.params || {} };
  });
  delete compendium.effects;

  return { ...world, system, compendium, sheets: world.sheets };
}

function resolveCall(activity, calls) {
  const call = calls.get(activity.effect);
  if (!call) return activity;
  return { label: activity.label, effect: call.rule, args: call.params || {} };
}
