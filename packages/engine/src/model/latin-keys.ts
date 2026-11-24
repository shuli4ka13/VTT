import type { System } from './types.ts';
import { tr } from '../words/tongue.ts';

const LATIN = /^[A-Za-z][A-Za-z0-9_]*$/;

const STEP_LISTS = ['steps', 'cost', 'attach', 'detach'] as const;

const TAG_LISTS = ['tags', 'anyTags', 'notTags', 'includes', 'cancels'] as const;

const NUMBER = /^\d+$/;

function tagKeys(holder: unknown, out: Set<string>): void {
  if (!holder || typeof holder !== 'object') return;
  for (const list of TAG_LISTS) {
    const tags = (holder as Record<string, unknown>)[list];
    for (const tag of Array.isArray(tags) ? tags : []) if (typeof tag === 'string') out.add(tag.replace(/ /g, '_'));
  }
}

function stepKeys(steps: unknown, out: Set<string>): void {
  if (!Array.isArray(steps)) return;
  for (const step of steps as Record<string, unknown>[]) {
    if (typeof step?.id === 'string') out.add(step.id);
    if (typeof step?.as === 'string') out.add(step.as);
    tagKeys(step, out);
  }
}

export function keysOf(system: System): string[] {
  const out = new Set<string>();
  const any = system as unknown as Record<string, any>;
  for (const [key, table] of Object.entries(any.tables ?? {}) as [string, any][]) {
    out.add(key);
    for (const column of table.columns ?? []) {
      out.add(column.key);
      for (const stage of column.stages ?? []) out.add(stage.key);
    }
    for (const row of table.rows ?? []) {
      if (typeof row.value === 'string' && row.value && !NUMBER.test(row.value)) out.add(row.value.replace(/ /g, '_'));
      for (const cell of Object.keys(row.cells ?? {})) out.add(cell);
    }
  }
  for (const [key, effect] of Object.entries(any.effects ?? {}) as [string, any][]) {
    out.add(key);
    if (effect.group) out.add(effect.group.replace(/ /g, '_'));
    for (const param of effect.params ?? []) {
      out.add(param.key);
      if (typeof param.item?.key === 'string') out.add(param.item.key);
      for (const stage of param.stages ?? []) out.add(stage.key);
    }
    for (const column of effect.returns ?? []) out.add(column.key);
    tagKeys(effect, out);
    for (const modifier of effect.modifiers ?? []) tagKeys(modifier, out);
    for (const list of STEP_LISTS) stepKeys(effect[list], out);
    for (const handler of effect.on ?? []) {
      tagKeys(handler, out);
      for (const list of STEP_LISTS) stepKeys(handler[list], out);
    }
  }
  for (const name of ['tags', 'rolls', 'roll_edits', 'sheets', 'groups', 'constants'] as const) {
    for (const key of Object.keys(any[name] ?? {})) out.add(key.replace(/ /g, '_'));
  }
  for (const contract of Object.values(any.tags ?? {}) as any[]) {
    tagKeys(contract, out);
    for (const input of contract?.inputs ?? []) if (typeof input?.key === 'string') out.add(input.key);
    if (typeof contract?.each === 'string') out.add(contract.each);
    for (const output of contract?.outputs ?? []) if (typeof output?.key === 'string') out.add(output.key);
    for (const trait of contract?.traits ?? []) if (typeof trait?.key === 'string') out.add(trait.key);
  }
  for (const roll of Object.values(any.rolls ?? {}) as any[]) {
    tagKeys(roll, out);
    for (const field of roll?.fields ?? []) tagKeys(field, out);
  }
  for (const edit of Object.values(any.roll_edits ?? {}) as any[]) tagKeys(edit, out);
  for (const constant of Object.values(any.constants ?? {}) as any[]) {
    for (const part of constant?.dice ?? []) if (typeof part?.name === 'string') out.add(part.name);
  }
  for (const block of any.blocks ?? []) out.add(String(block.key).replace(/ /g, '_'));
  for (const page of any.pages ?? []) out.add(String(page.key).replace(/ /g, '_'));
  return [...out];
}

export const foreignKeys = (system: System): string[] => keysOf(system).filter(key => !LATIN.test(key));

export function foreignKeysText(system: System): string | null {
  const found = foreignKeys(system);
  if (!found.length) return null;
  const shown = found.slice(0, 3).map(key => `«${key}»`).join(', ');
  return tr`ключей не латиницей: ${found.length} (${shown}${found.length > 3 ? ' …' : ''}) — такая система не откроется авторам с другим языком`;
}
