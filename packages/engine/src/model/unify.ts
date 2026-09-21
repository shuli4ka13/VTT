import { unifyBlocks } from './blocks.ts';
import type { System, Compendium, CompendiumRecord } from './types.ts';

type Loose = Record<string, any>;

const directProp = (ref: unknown): string | null => {
  if (!ref || typeof ref !== 'object') return null;
  const r = ref as Loose;
  if ('prop' in r) return String(r.prop);

  if ('item' in r) return String(r.item);
  return null;
};

function walkSlots(node: Loose, visit: (holder: Loose, key: string) => void): void {
  if (!node || typeof node !== 'object') return;
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (directProp(value) !== null) visit(node, key);
    else if (value && typeof value === 'object') walkSlots(value, visit);
  }
}

const hasDirect = (system: Loose): boolean => {
  let found = false;
  for (const effect of Object.values(system.effects ?? {}) as Loose[]) {
    for (const step of (effect.steps ?? []) as Loose[]) {
      walkSlots(step, () => { found = true; });
    }
  }
  return found;
};

const LEGACY_EDITS: Record<string, Loose> = {
  advantage: {
    label: 'Преимущество',
    ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }],
    canceledBy: 'disadvantage',
  },
  disadvantage: {
    label: 'Помеха',
    ops: [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }],
    canceledBy: 'advantage',
  },
};

function convertRollMods(mods: Loose[] | undefined, used: Set<string>): Loose[] | null {
  if (!mods?.length) return null;
  let changed = false;
  const next = mods.map(mod => {
    if (mod.kind !== 'roll' || !mod.effect) return mod;
    const key = String(mod.effect);
    used.add(key);
    changed = true;

    const { effect: _effect, method: _method, ...rest } = mod;
    return { ...rest, edit: key };
  });
  return changed ? next : null;
}

const hasLegacyRoll = (carriers: Loose[]) =>
  carriers.some(c => ((c.modifiers ?? []) as Loose[]).some(m => m.kind === 'roll' && m.effect));

function convertRollEdits(
  system: System, compendium?: Compendium,
): { system: System; compendium?: Compendium } {
  const source = system as unknown as Loose;
  const items = ((compendium?.items ?? []) as unknown as Loose[]);
  if (!hasLegacyRoll(Object.values(source.effects ?? {}) as Loose[]) && !hasLegacyRoll(items)) {
    return { system, compendium };
  }

  const next: Loose = JSON.parse(JSON.stringify(source));
  const used = new Set<string>();

  for (const effect of Object.values(next.effects ?? {}) as Loose[]) {
    const converted = convertRollMods(effect.modifiers, used);
    if (converted) effect.modifiers = converted;
  }

  let nextCompendium = compendium;
  if (compendium && hasLegacyRoll(items)) {
    const copy: Loose = JSON.parse(JSON.stringify(compendium));
    for (const item of (copy.items ?? []) as Loose[]) {
      const converted = convertRollMods(item.modifiers, used);
      if (converted) item.modifiers = converted;
    }
    nextCompendium = copy as unknown as Compendium;
  }

  next.roll_edits ??= {};
  for (const key of used) {
    if (!next.roll_edits[key] && LEGACY_EDITS[key]) {
      next.roll_edits[key] = JSON.parse(JSON.stringify(LEGACY_EDITS[key]));
    }
  }

  for (const [key, edit] of Object.entries(next.roll_edits) as [string, Loose][]) {
    if (edit.canceledBy && !next.roll_edits[edit.canceledBy]) delete edit.canceledBy;
    if (!edit.label) edit.label = key;
  }

  delete next.advantage;

  return { system: next as unknown as System, compendium: nextCompendium };
}

export function unifyRollEdits(system: System): System {
  return convertRollEdits(system).system;
}

export function unifyRollEditsWorld<T extends { system: System; compendium: Compendium }>(
  world: T,
): T {
  const next = convertRollEdits(world.system, world.compendium);
  return { ...world, system: next.system, compendium: next.compendium ?? world.compendium };
}

type EffectRenames = Map<string, string>;

type Renames = Map<string, EffectRenames>;

function unifySystem(system: System): { system: System; renames: Renames } {
  const source = system as unknown as Loose;
  if (!hasDirect(source)) return { system, renames: new Map() };

  const next: Loose = JSON.parse(JSON.stringify(source));
  const allRenames: Renames = new Map();

  const propDecl = (key: string): Loose | null => {
    for (const kind of Object.values(next.records ?? {}) as Loose[]) {
      const found = (kind.props ?? []).find((p: Loose) => p.key === key);
      if (found) return found;
    }
    return null;
  };

  for (const [effectId, effect] of Object.entries(next.effects ?? {}) as [string, Loose][]) {
    const renames: EffectRenames = new Map();

    for (const step of (effect.steps ?? []) as Loose[]) {
      walkSlots(step, (holder, key) => {
        const propKey = directProp(holder[key])!;
        let paramKey = renames.get(propKey);
        if (!paramKey) {

          const params: Loose[] = (effect.params ??= []);
          paramKey = propKey;
          for (let n = 2; params.some(p => p.key === paramKey); n++) paramKey = `${propKey}_${n}`;
          const decl = propDecl(propKey);
          params.push({ key: paramKey, label: decl?.label ?? propKey, kind: decl?.kind ?? 'expr' });
          renames.set(propKey, paramKey);
        }
        const optional = (holder[key] as Loose).optional;
        holder[key] = optional ? { param: paramKey, optional } : { param: paramKey };
      });
    }

    if (!renames.size) continue;
    allRenames.set(effectId, renames);

    for (const kind of Object.values(next.records ?? {}) as Loose[]) {
      for (const binding of (kind.bindings ?? []) as Loose[]) {
        if (binding.effect !== effectId) continue;
        binding.args ??= {};
        for (const [propKey, paramKey] of renames) {
          binding.args[paramKey] ??= { prop: propKey };
        }
      }
    }
  }

  return { system: next as unknown as System, renames: allRenames };
}

export function unifyRecordRefs(system: System): System {
  return unifyRollEdits(unifySystem(system).system);
}

function fillArgs(effectId: string, args: Loose | undefined, renames: Renames): Loose | null {
  const effectRenames = renames.get(effectId);
  if (!effectRenames) return null;
  const next: Loose = { ...(args ?? {}) };
  let changed = false;
  for (const [propKey, paramKey] of effectRenames) {
    if (next[paramKey] === undefined) { next[paramKey] = { prop: propKey }; changed = true; }
  }
  return changed ? next : null;
}

function unifyCompendium(compendium: Compendium, renames: Renames): Compendium {
  if (!renames.size) return compendium;

  let touched = false;

  const convertRecord = (record: CompendiumRecord): CompendiumRecord => {
    const r = record as Loose;

    if (r.activities && (r.activities as Loose[]).length) {
      let recordChanged = false;
      const activities = (r.activities as Loose[]).map(binding => {
        const args = fillArgs(String(binding.effect), binding.args, renames);
        if (args === null) return binding;
        recordChanged = true;
        return { ...binding, args };
      });
      if (!recordChanged) return record;
      touched = true;
      return { ...record, activities } as CompendiumRecord;
    }

    if (r.effect) {
      const args = fillArgs(String(r.effect), r.args, renames);
      if (args === null) return record;
      touched = true;
      return { ...record, args } as CompendiumRecord;
    }

    return record;
  };

  const items = (compendium.items ?? []).map(convertRecord);
  const actions = (compendium.actions ?? []).map(convertRecord);

  return touched ? { ...compendium, items, actions } : compendium;
}

export function unifyBounds(
  world: { system: System; compendium?: Compendium },
): { system: System; compendium?: Compendium } {
  const system = world.system as unknown as Loose;
  const effects = (system.effects ?? {}) as Record<string, Loose>;

  const tagsOfParam = (effectId: string, key: string): string[] => {
    const out = new Set<string>();
    const take = (binding: Loose | undefined) => {
      if (!binding || String(binding.effect) !== effectId) return;
      const arg = (binding.args as Loose | undefined)?.[key];
      if (typeof arg === 'string' && arg) out.add(arg);
    };
    for (const record of Object.values((system.records ?? {}) as Record<string, Loose>)) {
      for (const b of (record.bindings as Loose[] | undefined) ?? []) take(b);
    }
    for (const list of [world.compendium?.items, world.compendium?.actions]) {
      for (const record of (list ?? []) as Loose[]) {
        take(record);
        for (const b of (record.activities as Loose[] | undefined) ?? []) take(b);
      }
    }
    return [...out];
  };

  const boundValue = (ref: unknown): number | string | null => {
    if (!ref || typeof ref !== 'object') return null;
    const r = ref as Loose;
    if ('const' in r && typeof r.const === 'number') return r.const;
    if ('tag' in r) return `#${String(r.tag)}`;
    if ('expr' in r) return String(r.expr);
    return null;
  };

  const bounds = new Map<string, { min?: number | string; max?: number | string }>();
  const translated = new Set<Loose>();

  for (const [effectId, effect] of Object.entries(effects)) {
    for (const step of (effect.steps as Loose[] | undefined) ?? []) {
      if (step.type !== 'apply' || (step.floor === undefined && step.ceiling === undefined)) continue;
      const target = step.target as Loose | undefined;
      const tags = target && 'tag' in target ? [String(target.tag)]
        : target && 'param' in target ? tagsOfParam(effectId, String(target.param))
          : [];
      if (!tags.length) continue;
      const min = boundValue(step.floor);
      const max = boundValue(step.ceiling);
      if ((step.floor !== undefined && min === null) || (step.ceiling !== undefined && max === null)) continue;
      for (const tag of tags) {
        const entry = bounds.get(tag) ?? {};
        if (min !== null) entry.min = entry.min ?? min;
        if (max !== null) entry.max = entry.max ?? max;
        bounds.set(tag, entry);
      }
      translated.add(step);
    }
  }

  if (!translated.size && !bounds.size) return world;

  const nextEffects = Object.fromEntries(Object.entries(effects).map(([id, effect]) => {
    const steps = ((effect.steps as Loose[] | undefined) ?? []).map(step => {
      if (!translated.has(step)) return step;
      const { floor: _floor, ceiling: _ceiling, ...rest } = step;
      return rest;
    });
    return [id, { ...effect, steps }];
  }));

  const fields = ((system.fields ?? []) as Loose[]).map(field => {
    const entry = bounds.get(String(field.tag));
    const value = field.value as Loose | undefined;
    if (!entry || !value || value.kind !== 'stored') return field;
    return {
      ...field,
      value: {
        ...value,
        ...(entry.min !== undefined && value.min === undefined ? { min: entry.min } : {}),
        ...(entry.max !== undefined && value.max === undefined ? { max: entry.max } : {}),
      },
    };
  });

  return {
    ...world,
    system: { ...(system as object), fields, effects: nextEffects } as unknown as System,
  };
}

export function unifyEvents(system: System): System {
  const source = system as unknown as Loose;
  if (!source.events || !Object.keys(source.events).length) return system;

  const next: Loose = JSON.parse(JSON.stringify(source));
  next.effects ??= {};
  for (const [id, event] of Object.entries(next.events as Record<string, Loose>)) {
    const key = next.effects[id] ? `${id}-общий` : id;
    next.effects[key] = {
      label: event.label ?? id,
      ...(event.tags?.length ? { tags: event.tags } : {}),
      steps: event.receive ?? [],
    };
    if (key === id) continue;
    for (const effect of Object.values(next.effects as Record<string, Loose>)) {
      for (const step of [...(effect.steps ?? []), ...(effect.self ?? [])] as Loose[]) {
        if (step.type === 'emit' && step.event === id) step.event = key;
      }
    }
  }
  delete next.events;
  return next as unknown as System;
}

export function unifyWorld(
  world: { system: System; compendium: Compendium },
): { system: System; compendium: Compendium } {
  const { system, renames } = unifySystem(unifyBlocks(unifyEvents(world.system)));
  const withRefs = unifyCompendium(world.compendium, renames);
  const edited = convertRollEdits(system, withRefs);
  const bounded = unifyBounds({ system: edited.system, compendium: edited.compendium ?? withRefs });
  return { system: bounded.system, compendium: bounded.compendium ?? withRefs };
}
