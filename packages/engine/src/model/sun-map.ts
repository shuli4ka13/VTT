import type { Compendium, Effect, Step, System, TagContract } from './types.ts';
import type { StepData } from '../engine/steps/index.ts';
import { flattenSystem } from './inherit.ts';
import { listenerOf } from './references.ts';
import { emittedChoices } from './payments.ts';
import { stepTagReach } from './roll-reach.ts';
import { keysOf } from '../core/subs.ts';
import { tagSaid } from '../engine/roll-tags.ts';
import { kindOfRecord, findRecord, withLibrary } from './owned.ts';
import { bindingsOf } from '../events/actions.ts';
import { launchOf, type LaunchKind } from './effect-kinds.ts';
import { ROLL_CALL } from '../words/calls.ts';
import { ANY_ACTION, type Phase } from '../events/happenings.ts';
import { callSlot, depsOf, exprsIn, mergeMeddle, moduleOf, rollMeddle, seamsOf, standsOf, sureTags, tagsSlot, type Meddle, type Seam, type Stand } from './sun.ts';
import type { Place } from './names-at.ts';

export type ChainVia = 'button' | 'grant' | 'call' | 'cost' | 'state';

export interface ChainNode {
  effect: string;
  label: string;
  via: ChainVia;
  said?: string;
  seams: Seam[];
  stands: Stand[];
  meddle: Meddle | null;
  again?: true;
  children: ChainNode[];
}

export interface RecordChain { record: string; label: string; nodes: ChainNode[] }

const DEPTH = 5;

interface Called { id: string; via: ChainVia; place: Place }

function callsIn(system: System, effectId: string, effect: Effect, compendium?: Compendium): Called[] {
  const out: Called[] = [];
  const walk = (steps: readonly Step[] | undefined, via: ChainVia, placeOf: (index: number) => Place): void => {
    (steps ?? []).forEach((step, index) => {
      const mod = moduleOf(step);
      for (const slot of (mod?.slots ?? []) as { key: string; kind?: string; refersTo?: string }[]) {
        const refers = mod?.slotRefers?.(step as StepData, slot.key) ?? slot.refersTo;
        const calls = Boolean(mod?.calls) && callSlot(step) === (step as Record<string, unknown>)[slot.key];
        if (!calls && refers !== 'effect') continue;
        for (const id of emittedChoices(system, effectId, (step as Record<string, unknown>)[slot.key], compendium)) {
          out.push({ id, via: calls ? via : 'state', place: placeOf(index) });
        }
      }
    });
  };
  walk(effect.cost, 'cost', index => ({ part: 'cost', index }));
  walk(effect.steps, 'call', index => ({ part: 'steps', index }));
  (effect.on ?? []).forEach((handler, at) => {
    walk(handler.cost, 'cost', index => ({ part: 'handler-cost', handler: at, index }));
    walk(handler.steps, 'call', index => ({ part: 'handler', handler: at, index }));
  });
  walk(effect.attach, 'call', index => ({ part: 'attach', index }));
  walk(effect.detach, 'call', index => ({ part: 'detach', index }));
  return out;
}

function ownRolls(system: System, effectId: string, effect: Effect, compendium?: Compendium): Meddle | null {
  const found: Meddle[] = [];
  (effect.steps ?? []).forEach((step, index) => {
    if (!moduleOf(step)?.dice?.(step as StepData)) return;
    const meddle = rollMeddle(system, effectId, { part: 'steps', index }, compendium);
    if (meddle) found.push(meddle);
  });
  return mergeMeddle(found);
}

function nodeOf(system: System, compendium: Compendium | undefined, id: string, via: ChainVia, meddle: Meddle | null, path: ReadonlySet<string>, depth: number): ChainNode {
  const effect = system.effects?.[id];
  const base = { effect: id, label: effect?.label ?? id, via, seams: effect ? seamsOf(system, id, compendium) : [], stands: effect ? standsOf(system, id, compendium) : [], meddle };
  if (!effect || path.has(id) || depth >= DEPTH) return { ...base, ...(path.has(id) ? { again: true as const } : {}), children: [] };
  const next = new Set([...path, id]);
  const seen = new Set<string>();
  const children: ChainNode[] = [];
  for (const called of callsIn(system, id, effect, compendium)) {
    const key = `${called.via}|${called.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const inner = called.via === 'state' ? null : rollMeddle(system, id, called.place, compendium);
    children.push(nodeOf(system, compendium, called.id, called.via, inner, next, depth + 1));
  }
  return { ...base, children };
}

export function chainOf(raw: System, book: Compendium | null | undefined, recordId: string): RecordChain | null {
  const system = flattenSystem(raw, true);
  const compendium = withLibrary(system, book);
  const record = findRecord(compendium, recordId);
  if (!record) return null;
  const nodes: ChainNode[] = [];
  const own: Compendium = { ...compendium, records: [record] };
  for (const binding of bindingsOf(record, system)) {
    const id = typeof binding.effect === 'string' ? binding.effect : '';
    const effect = id ? system.effects?.[id] : undefined;
    if (!effect) continue;
    const node = nodeOf(system, own, id, 'button', ownRolls(system, id, effect, own), new Set(), 0);
    nodes.push({ ...node, ...(binding.label ? { said: binding.label } : {}) });
  }
  for (const id of [...(kindOfRecord(system, record)?.grants ?? []), ...(record.grants ?? [])]) {
    if (system.effects?.[id]) nodes.push(nodeOf(system, own, id, 'grant', null, new Set(), 0));
  }
  return { record: recordId, label: record.label ?? recordId, nodes };
}

export interface TagLinks {
  tag: string;
  label: string;
  contract: TagContract | null;
  carries: string[];
  marks: string[];
  hears: { effect: string; handler: number; phase: Phase }[];
  edits: { effect: string; index: number; call: string }[];
}

const chainsOf = (effect: Effect): readonly Step[][] => [
  effect.cost ?? [], effect.steps ?? [], effect.attach ?? [], effect.detach ?? [],
  ...(effect.on ?? []).flatMap(handler => [handler.cost ?? [], handler.steps ?? []]),
];

function marksOf(system: System, effect: Effect, compendium?: Compendium): Set<string> {
  const out = new Set<string>();
  for (const steps of chainsOf(effect)) {
    for (const step of steps) {
      const raw = tagsSlot(step);
      if (!Array.isArray(raw)) continue;
      for (const tag of [...sureTags(raw), ...stepTagReach(system, effect.params ?? [], raw, compendium).tags]) out.add(tag);
    }
  }
  return out;
}

export function tagLinks(raw: System, tag: string, compendium?: Compendium): TagLinks {
  const system = flattenSystem(raw, true);
  const effects = Object.entries(system.effects ?? {});
  return {
    tag,
    label: tagSaid(system, tag),
    contract: system.tags?.[tag] ?? null,
    carries: effects.filter(([id]) => keysOf(system, id, false).slice(1).includes(tag)).map(([id]) => id),
    marks: effects.filter(([, effect]) => marksOf(system, effect, compendium).has(tag)).map(([id]) => id),
    hears: effects.flatMap(([id, effect]) => (effect.on ?? []).flatMap((handler, index) => {
      const heard = listenerOf(handler);
      return heard.kind === 'call' && heard.key === tag ? [{ effect: id, handler: index, phase: heard.phase }] : [];
    })),
    edits: effects.flatMap(([id, effect]) => (effect.modifiers ?? []).flatMap((mod, index) => (
      mod.kind === 'edit' && [...(mod.tags ?? []), ...(mod.anyTags ?? []), ...(mod.notTags ?? [])].includes(tag) ? [{ effect: id, index, call: mod.call }] : []
    ))),
  };
}

export type MapLinkKind = 'calls' | 'applies' | 'carries' | 'hears' | 'edits';

export interface MapLink { from: string; to: string; kind: MapLinkKind; via: 'id' | 'tag' | 'any'; phase?: Phase }

export type MapLeak =
  | { kind: 'by-name'; effect: string; handler: number; of: string }
  | { kind: 'inner'; effect: string; handler: number; of: string; names: string[] }
  | { kind: 'silent-tag'; tag: string };

export interface SunMap {
  effects: { id: string; label: string; launch: LaunchKind; group?: string }[];
  tags: { id: string; label: string; contract: boolean }[];
  links: MapLink[];
  leaks: MapLeak[];
}

export function mapOf(raw: System, compendium?: Compendium): SunMap {
  const system = flattenSystem(raw, true);
  const effects = Object.entries(system.effects ?? {});
  const links: MapLink[] = [];
  const leaks: MapLeak[] = [];
  const seen = new Set<string>();
  const link = (one: MapLink): void => {
    const key = `${one.from}|${one.to}|${one.kind}|${one.via}|${one.phase ?? ''}`;
    if (!seen.has(key)) { seen.add(key); links.push(one); }
  };
  const tagIds = new Set<string>(Object.keys(system.tags ?? {}));
  for (const [id, effect] of effects) {
    for (const tag of effect.tags ?? []) { tagIds.add(tag); link({ from: id, to: tag, kind: 'carries', via: 'tag' }); }
    for (const called of callsIn(system, id, effect, compendium)) {
      if (called.id !== id) link({ from: id, to: called.id, kind: called.via === 'state' ? 'applies' : 'calls', via: 'id' });
    }
    (effect.on ?? []).forEach((handler, index) => {
      const heard = listenerOf(handler);
      if (heard.kind !== 'call') return;
      const named = Boolean(system.effects?.[heard.key]);
      const via = heard.key === ANY_ACTION ? 'any' : named ? 'id' : 'tag';
      if (via === 'tag') tagIds.add(heard.key);
      link({ from: id, to: heard.key, kind: 'hears', via, phase: heard.phase });
      if (via !== 'id' || heard.key === id) return;
      leaks.push({ kind: 'by-name', effect: id, handler: index, of: heard.key });
      const inner = new Set((system.effects![heard.key]!.steps ?? []).map(step => step.id).filter((one): one is string => typeof one === 'string' && one !== ''));
      const used = [...new Set(exprsIn([handler.if, handler.cost, handler.steps]).flatMap(source => depsOf(source)).map(dep => dep.split('.')[0]!))].filter(name => inner.has(name));
      if (used.length) leaks.push({ kind: 'inner', effect: id, handler: index, of: heard.key, names: used });
    });
    for (const mod of effect.modifiers ?? []) {
      if (mod.kind !== 'edit') continue;
      if (mod.call !== ROLL_CALL) { link({ from: id, to: mod.call, kind: 'edits', via: 'id' }); continue; }
      for (const tag of [...(mod.tags ?? []), ...(mod.anyTags ?? [])]) { tagIds.add(tag); link({ from: id, to: tag, kind: 'edits', via: 'tag' }); }
    }
  }
  for (const tag of Object.keys(system.tags ?? {})) {
    const used = links.some(one => one.to === tag && (one.kind === 'hears' || one.kind === 'edits'))
      || Object.values(system.tags ?? {}).some(contract => (contract.includes ?? []).includes(tag) && contract !== system.tags![tag]);
    if (!used) leaks.push({ kind: 'silent-tag', tag });
  }
  return {
    effects: effects.map(([id, effect]) => ({ id, label: effect.label ?? id, launch: launchOf(effect).kind, ...(effect.group ? { group: effect.group } : {}) })),
    tags: [...tagIds].map(id => ({ id, label: tagSaid(system, id), contract: Boolean(system.tags?.[id]) })),
    links,
    leaks,
  };
}
