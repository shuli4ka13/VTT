import type { MapEffect, MapLayer, MapLink, MapTag, SunMap } from '@vtt/engine';

export interface MapGroup { key: string; label: string; effects: MapEffect[] }

export function groupsOf(map: SunMap, layer: MapLayer): MapGroup[] {
  const groups: MapGroup[] = [];
  const index = new Map<string, MapGroup>();
  for (const effect of map.effects) {
    if (effect.layer !== layer) continue;
    const key = effect.group ?? '';
    let group = index.get(key);
    if (!group) {
      group = { key, label: effect.groupLabel ?? '', effects: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.effects.push(effect);
  }
  return groups;
}

export const SHOWN = 3;

export function summaryOf(effects: readonly { label: string }[], shown = SHOWN): { names: string[]; rest: number } {
  return { names: effects.slice(0, shown).map(one => one.label), rest: Math.max(0, effects.length - shown) };
}

export const blockKey = (layer: MapLayer, group: string | undefined): string => `${layer}|${group ?? ''}`;

export type Pick = { kind: 'effect' | 'tag'; id: string };

export interface Target { kind: 'effect' | 'tag' | 'any'; id: string; label: string }

export interface Heard { target: Target; via: MapLink['via']; phase: NonNullable<MapLink['phase']> }

export interface Edited { target: Target; via: MapLink['via'] }

export interface Related {
  calls: Target[];
  calledBy: Target[];
  carries: Target[];
  hears: Heard[];
  edits: Edited[];
  carriers: Target[];
  hearers: { who: Target; phase: Heard['phase'] }[];
  editors: Target[];
  involved: Set<string>;
}

export const keyOf = (kind: 'effect' | 'tag', id: string): string => `${kind}:${id}`;

export function relatedTo(map: SunMap, pick: Pick, carriers?: readonly string[]): Related {
  const effects = new Map(map.effects.map(one => [one.id, one] as const));
  const tags = new Map<string, MapTag>(map.tags.map(one => [one.id, one] as const));
  const effectTarget = (id: string): Target => ({ kind: 'effect', id, label: effects.get(id)?.label ?? id });
  const tagTarget = (id: string): Target => ({ kind: 'tag', id, label: tags.get(id)?.label ?? id });
  const aim = (link: MapLink): Target => {
    if (link.via === 'any') return { kind: 'any', id: link.to, label: link.to };
    if (link.via === 'tag') return tagTarget(link.to);
    return effectTarget(link.to);
  };
  const out: Related = { calls: [], calledBy: [], carries: [], hears: [], edits: [], carriers: [], hearers: [], editors: [], involved: new Set() };
  const seen = new Set<string>();
  const once = (list: string, key: string): boolean => {
    const full = `${list}|${key}`;
    if (seen.has(full)) return false;
    seen.add(full);
    return true;
  };
  for (const link of map.links) {
    if (pick.kind === 'effect') {
      if (link.from === pick.id) {
        if (link.kind === 'calls' || link.kind === 'applies') { if (once('calls', link.to)) out.calls.push(effectTarget(link.to)); }
        else if (link.kind === 'carries') { if (once('carries', link.to)) out.carries.push(tagTarget(link.to)); }
        else if (link.kind === 'hears') out.hears.push({ target: aim(link), via: link.via, phase: link.phase ?? 'before' });
        else if (link.kind === 'edits') { if (once('edits', `${link.via}|${link.to}`)) out.edits.push({ target: aim(link), via: link.via }); }
      }
      if (link.to === pick.id && link.via === 'id' && (link.kind === 'calls' || link.kind === 'applies') && once('calledBy', link.from)) out.calledBy.push(effectTarget(link.from));
    } else if (link.to === pick.id && link.via === 'tag') {
      if (link.kind === 'carries' && !carriers && once('carriers', link.from)) out.carriers.push(effectTarget(link.from));
      else if (link.kind === 'hears') out.hearers.push({ who: effectTarget(link.from), phase: link.phase ?? 'before' });
      else if (link.kind === 'edits' && once('editors', link.from)) out.editors.push(effectTarget(link.from));
    }
  }
  if (pick.kind === 'tag' && carriers) out.carriers = carriers.map(effectTarget);
  const add = (target: Target): void => { if (target.kind !== 'any') out.involved.add(keyOf(target.kind, target.id)); };
  out.involved.add(keyOf(pick.kind, pick.id));
  for (const list of [out.calls, out.calledBy, out.carries, out.carriers, out.editors]) list.forEach(add);
  out.hears.forEach(one => add(one.target));
  out.edits.forEach(one => add(one.target));
  out.hearers.forEach(one => add(one.who));
  return out;
}

export function effectsOfBlock(group: MapGroup, involved: ReadonlySet<string>): number {
  return group.effects.filter(one => involved.has(keyOf('effect', one.id))).length;
}
