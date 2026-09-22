import { EngineError } from './errors.ts';
import type {
  System, Sheet, Compendium, Effect, Modifier, Step,
  Activation, DurationKind, Stacking, WornEffect,
} from '../model/types.ts';

const PIPELINE_ACTIVATIONS: Activation[] = ['manual', 'triggered', 'reaction'];
const ACTIVATIONS: Activation[] = [...PIPELINE_ACTIVATIONS, 'passive'];
const DURATIONS: DurationKind[] = ['permanent', 'temporary', 'uses', 'rounds', 'turns', 'scene'];
const STACKINGS: Stacking[] = ['ignore', 'refresh', 'stack'];

const pick = <T extends string>(value: unknown, allowed: T[], fallback: T): T =>
  (allowed.includes(value as T) ? value as T : fallback);

export const activationOf = (effect: Effect | null | undefined): Activation =>
  pick(effect && effect.activation, ACTIVATIONS, 'manual');

export const durationOf = (effect: Effect | null | undefined): DurationKind =>
  pick(effect && effect.duration && effect.duration.kind, DURATIONS, 'permanent');

export const stackingOf = (effect: Effect | null | undefined): Stacking =>
  pick(effect && effect.stacking, STACKINGS, 'ignore');

export const isPipeline = (effect: Effect | null | undefined): boolean =>
  PIPELINE_ACTIVATIONS.includes(activationOf(effect));

export const effectsOf = (system: System): [string, Effect][] =>
  Object.entries(system.effects || {});

export const findEffect = (system: System, id: string): Effect | null =>
  (system.effects || {})[id] || null;

export function requireEffect(system: System, id: string, who: string): Effect {
  const effect = findEffect(system, id);
  if (!effect) {
    throw new EngineError(
      `${who}: система не объявляет эффекта «${id}» — библиотека знает: ${
        effectsOf(system).map(([key]) => key).join(', ') || '(пусто)'}`);
  }
  return effect;
}

export const calledOf = (system: System): [string, Effect][] => {
  const called = new Set<string>();
  for (const effect of Object.values(system.effects || {})) {
    if (effect.tags?.length) continue;
    for (const step of [...(effect.steps ?? []), ...(effect.self ?? [])] as Record<string, unknown>[]) {
      if (step.type === 'emit' && step.event) called.add(String(step.event));
    }
  }
  const takesAmount = (effect: Effect) => (effect.params ?? []).some(p => (p as { role?: string }).role === 'amount');
  return Object.entries(system.effects || {}).filter(([id, effect]) => effect.tags?.length || takesAmount(effect) || called.has(id));
};

export function requireCalled(system: System, id: string, who: string): Effect {
  const effect = (system.effects || {})[id];
  if (!effect) {
    throw new EngineError(
      `${who}: система не объявляет эффект «${id}» — известны: ${
        Object.keys(system.effects || {}).join(', ') || '(пусто)'}`);
  }
  return effect;
}

export function usesMax(effect: Effect): number | null {
  if (durationOf(effect) !== 'uses') return null;
  const max = Number(effect.duration!.max);
  return Number.isFinite(max) && max > 0 ? Math.floor(max) : 1;
}

export interface EffectEntry { id: string; effect: Effect }
export interface WornEntry extends EffectEntry { entry: WornEffect }

export function roomEffects(system: System): EffectEntry[] {
  const out: EffectEntry[] = [];
  for (const id of system.room_rules || []) {
    const effect = findEffect(system, id);
    if (!effect) continue;
    out.push({ id, effect });
  }
  return out;
}

export const allModifiers = (system: System, compendium: Compendium = {}): Modifier[] => [
  ...effectsOf(system).flatMap(([, effect]) => effect.modifiers || []),
  ...(compendium.items || []).flatMap(record => record.modifiers || []),
];

export const allSteps = (system: System): Step[] =>
  effectsOf(system).flatMap(([, effect]) => effect.steps || []);

export function grantedTo(sheet: Sheet, compendium: Compendium | null | undefined): string[] {
  if (!compendium) return [];
  const owned = [
    ...(sheet.equipped || []).map(id => (compendium.items || []).find(record => record.id === id)),
    ...((sheet.actions as string[] | undefined) || []).map(id => (compendium.actions || []).find(record => record.id === id)),
  ];
  return [...new Set(owned.flatMap(record => record?.grants ?? []))];
}

export function wornEffects(
  system: System, sheet: Sheet,
  { strict = true, compendium }: { strict?: boolean; compendium?: Compendium | null } = {},
): WornEntry[] {
  const out: WornEntry[] = [];
  for (const entry of sheet.effects || []) {
    const effect = findEffect(system, entry.effectId);
    if (!effect) {
      if (!strict) continue;
      throw new EngineError(
        `на листе «${sheet.id}» висит эффект «${entry.effectId}», которого система не объявляет`);
    }
    out.push({ id: entry.effectId, effect, entry });
  }
  for (const id of grantedTo(sheet, compendium)) {
    if (out.some(worn => worn.id === id)) continue;
    const effect = findEffect(system, id);
    if (!effect) continue;
    out.push({ id, effect, entry: { effectId: id } });
  }
  return out;
}
