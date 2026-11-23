import { slugOf, freeId } from '../../store/world.ts';
import { t } from '../../i18n/author.ts';
import { usageIndex, inUse } from './usage.ts';
import type { System, Compendium } from '@vtt/schema';
import { splitsTargets, NAMES, everyLabel, nameLabel, stepSaid } from '@vtt/engine';
import { plain } from '../../ui/formula-resolve.ts';

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function withoutShadowing(world: unknown, key: string, own: unknown): unknown {
  const holder = world as { s?: { effects?: Record<string, unknown> }; effects?: Record<string, unknown> };
  const effects = holder.effects ?? holder.s?.effects;
  if (!effects) return world;
  const lists = [(own as { steps?: unknown })?.steps, (own as { cost?: unknown })?.cost]
    .filter((list): list is unknown[] => Array.isArray(list) && list.length > 0)
    .map(list => JSON.stringify(list));
  const declares = `"id":${JSON.stringify(key)}`;
  const kept = Object.fromEntries(Object.entries(effects).filter(([, effect]) => {
    const text = JSON.stringify(effect);
    return !text.includes(declares) || lists.some(list => text.includes(list));
  }));
  return holder.effects ? { ...holder, effects: kept } : { ...holder, s: { ...holder.s, effects: kept } };
}

export function referenced(world: unknown, key: string, own: unknown = world): boolean {
  if (JSON.stringify(own, (name, value) => (name === 'tags' ? undefined : value)).split(`"${key}"`).length - 1 > 1) return true;
  const seen = own === world ? world : withoutShadowing(world, key, own);
  return new RegExp(`[@#]${escape(key)}(?![\\p{L}\\p{N}_])`, 'u').test(JSON.stringify(seen));
}

export function effectUsed(system: System, compendium: Compendium | undefined, id: string): boolean {
  const index = usageIndex(system, compendium);
  return inUse(index, 'effect', id) || inUse(index, 'event', id);
}

function passesArg(node: unknown, effectId: string, key: string): boolean {
  if (Array.isArray(node)) return node.some(item => passesArg(item, effectId, key));
  if (!node || typeof node !== 'object') return false;
  const o = node as Record<string, unknown>;
  if (o.effect === effectId && o.args && typeof o.args === 'object' && key in (o.args as object)) return true;
  return Object.values(o).some(value => passesArg(value, effectId, key));
}

function loopsOver(node: unknown, key: string): boolean {
  if (Array.isArray(node)) return node.some(item => loopsOver(item, key));
  if (!node || typeof node !== 'object') return false;
  const o = node as Record<string, unknown>;
  if (splitsTargets(o) && o.of === key) return true;
  return Object.values(o).some(value => loopsOver(value, key));
}

function lineage(_system: System, effectId: string): string[] {
  return [effectId];
}

export function paramUsed(system: System, compendium: Compendium | undefined, effectId: string, key: string): boolean {
  const named = new RegExp(`[@#]${escape(key)}(?![\\p{L}\\p{N}_])`, 'u');
  for (const id of lineage(system, effectId)) {
    const effect = system.effects[id];
    if (!effect) continue;
    if (named.test(JSON.stringify(effect))) return true;
    if (loopsOver(effect, key) || effect.bond?.by === key || effect.duration?.by === key) return true;
    if (passesArg(system, id, key) || passesArg(compendium, id, key)) return true;
  }
  return false;
}

export function looksAuto(key: string, base: string, label: string): boolean {
  const pattern = (word: string) => new RegExp(`^${escape(slugOf(word))}(_\\d+)?$`, 'u');
  return pattern(base).test(key) || (Boolean(slugOf(label)) && pattern(label).test(key));
}

export function followKey({ used, key, base, before, after, taken }: {
  used: boolean; key: string; base: string; before: string; after: string; taken: Iterable<string>;
}): string {
  if (!slugOf(after) || !looksAuto(key, base, before) || used) return key;
  return freeId([...taken].filter(other => other !== key), after);
}

export const keyOf = (text: string): string => slugOf(text);

const RESERVED: readonly string[] = [NAMES.row, NAMES.holder, NAMES.desk];

export const reservedName = (text: string): boolean => RESERVED.some(name => name === text || everyLabel(name).includes(text));

export interface NameKeys { key: 'id' | 'as'; label: 'label' | 'asLabel' }

type Named = { id?: unknown; label?: unknown };

export const namedSteps = (effect: { steps?: unknown; cost?: unknown }): Named[] =>
  [...((effect.cost as Named[] | undefined) ?? []), ...((effect.steps as Named[] | undefined) ?? [])]
    .filter(step => typeof step.id === 'string' && step.id !== '');

export const loopNames = (effect: { steps?: unknown; cost?: unknown }): Named[] =>
  ([...((effect.cost as Record<string, unknown>[] | undefined) ?? []), ...((effect.steps as Record<string, unknown>[] | undefined) ?? [])])
    .filter(step => typeof step.as === 'string' && step.as !== '')
    .map(step => ({ id: step.as, label: step.asLabel }));

const wordsOf = (typed: string): string => typed.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

export function stepNameTrouble(typed: string, step: Named, others: readonly Named[]): string | null {
  const text = wordsOf(typed);
  const next = keyOf(text);
  if (!next) return t('constructor:name.empty');
  const had = typeof step.id === 'string' && step.id !== '';
  if (had && text === stepSaid(step)) return null;
  if (reservedName(next) || reservedName(text)) return t('constructor:name.reserved', { name: nameLabel(next) ?? text });
  if (others.some(other => plain(stepSaid(other)) === plain(text))) return t('constructor:name.taken', { name: text });
  return null;
}

export function applyName(holder: Record<string, unknown>, names: NameKeys, typed: string, taken: Iterable<string> = []): void {
  const text = wordsOf(typed);
  const had = typeof holder[names.key] === 'string' && holder[names.key] !== '';
  if (!text) { if (had) delete holder[names.label]; return; }
  if (!had) holder[names.key] = freeId(taken, text);
  if (text === stepSaid({ id: holder[names.key] })) delete holder[names.label];
  else holder[names.label] = text;
}

export function stepIdsOf(node: unknown): string[] {
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const holder = value as Record<string, unknown>;
    if (typeof holder.type === 'string' && typeof holder.id === 'string' && holder.id) out.push(holder.id);
    Object.values(holder).forEach(walk);
  };
  walk(node);
  return out;
}
