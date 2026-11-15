import type { System } from './types.ts';
import { fieldsOf } from './sheet-columns.ts';
import { isTagWord } from '../engine/roll-tags.ts';
import { rollTagReach } from './roll-reach.ts';

export interface RollGroup { value: string; label: string }

const stepTags = (system: System): string[] => {
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (node.type === 'roll' && Array.isArray(node.tags)) for (const tag of node.tags) if (isTagWord(tag)) out.push(tag);
    Object.values(node).forEach(walk);
  };
  walk(system.effects ?? {});
  for (const tag of (system.initiative as { tags?: unknown[] } | undefined)?.tags ?? []) if (isTagWord(tag)) out.push(tag);
  return out;
};

export function rollGroupsOf(system: System): { rules: RollGroup[]; kinds: RollGroup[] } {
  const rules = Object.entries(system.rolls ?? {})
    .filter(([key]) => isTagWord(key))
    .map(([key, rule]) => ({ value: key, label: rule.label || key }));
  const ruleKeys = new Set(rules.map(rule => rule.value));
  const carried = new Set<string>();
  for (const field of fieldsOf(system)) for (const tag of field.roll?.tags ?? []) if (isTagWord(tag)) carried.add(tag);
  for (const tag of stepTags(system)) carried.add(tag);
  const reach = rollTagReach(system);
  if (!reach.open) for (const tag of reach.tags) if (isTagWord(tag)) carried.add(tag);
  const kinds = [...carried]
    .filter(tag => !ruleKeys.has(tag))
    .sort((a, b) => a.localeCompare(b, 'ru'))
    .map(tag => ({ value: tag, label: tag }));
  return { rules, kinds };
}

export const ruleLabelOf = (system: System, tag: string): string | undefined =>
  (isTagWord(tag) ? system.rolls?.[tag]?.label || (system.rolls?.[tag] ? tag : undefined) : undefined);
