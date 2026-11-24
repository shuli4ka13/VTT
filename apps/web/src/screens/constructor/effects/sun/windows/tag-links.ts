import { effectTags, listenerOf } from '@vtt/engine';
import type { Seam } from '@vtt/engine';
import type { System } from '@vtt/schema';

export interface Hearer { effect: string; handler: number; phase: Seam['phase'] }

export interface Editor { effect: string; count: number }

export interface TagLinks { carriers: string[]; hearers: Hearer[]; editors: Editor[] }

type Loose = Record<string, unknown>;

const mentions = (modifier: Loose, tag: string): boolean =>
  [modifier.tags, modifier.anyTags].some(list => Array.isArray(list) && list.includes(tag));

export function tagLinks(system: System, tag: string): TagLinks {
  const carriers: string[] = [];
  const hearers: Hearer[] = [];
  const editors: Editor[] = [];
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    if (effectTags(system, id).includes(tag)) carriers.push(id);
    (effect.on ?? []).forEach((handler, index) => {
      const heard = listenerOf(handler);
      if (heard.kind === 'call' && heard.key === tag) hearers.push({ effect: id, handler: index, phase: heard.phase });
    });
    const count = ((effect.modifiers ?? []) as unknown as Loose[]).filter(one => one.kind === 'edit' && mentions(one, tag)).length;
    if (count) editors.push({ effect: id, count });
  }
  return { carriers, hearers, editors };
}
