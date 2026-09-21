import { unifyRollEditsWorld, unifyEvents } from './unify.ts';
import type { World, Effect, RecordKind, Binding, Modifier } from './types.ts';

type Legacy = Record<string, any>;

const isCall = (record: Legacy) => Boolean(record && record.rule);

export function healLegacySides(world: Legacy): Legacy {
  const effects = world?.system?.effects;
  if (!effects || typeof effects !== 'object') return world;
  for (const effect of Object.values<Legacy>(effects)) {
    for (const step of (effect?.steps as Legacy[]) || []) {
      if (step?.side === 'sender') delete step.side;
    }
  }
  return world;
}

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

  system.records = Object.fromEntries(
    Object.entries<RecordKind>(system.records || {}).filter(([, decl]) => !['call', 'effect'].includes(decl.kind)));

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

  return unifyRollEditsWorld(
    { ...world, system: unifyEvents(system as unknown as World['system']), compendium, sheets: world.sheets } as World);
}

function resolveCall(activity: Legacy, calls: Map<string, Legacy>): Binding {
  const call = calls.get(activity.effect);
  if (!call) return activity as Binding;
  return { label: activity.label, effect: call.rule, args: call.params || {} };
}
