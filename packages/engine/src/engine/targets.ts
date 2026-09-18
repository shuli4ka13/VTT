import { UnknownTagError } from './errors.ts';
import type { System } from '../model/types.ts';

export type TargetKind = 'value' | 'roll' | 'incoming' | 'event';

export interface Target {
  tag: string;
  label: string;
  group?: string;
  kind: TargetKind;

  from?: string;
}

export const rollTagOf = (tag: string) => `check:${tag}`;

export const incomingTagOf = (tag: string) => `incoming:${tag}`;

export const ANY_ROLL = 'roll:any';

export const eventTagOf = (id: string) => `event:${id}`;

export function targets(system: System): Target[] {
  const rolls: Target[] = [
    { tag: ANY_ROLL, label: 'Любой бросок', group: 'Броски', kind: 'roll' },

    ...(system.rolls || []).map((r): Target => ({ tag: r.tag, label: r.label, group: 'Броски', kind: 'roll' })),

    ...system.fields.filter(f => f.roll).map((f): Target => ({
      tag: rollTagOf(f.tag),
      label: f.roll!.label || `Проверка: ${f.label}`,
      group: f.group,
      kind: 'roll',
      from: f.tag,
    })),
  ];

  return [
    ...rolls,

    ...system.fields.map((f): Target => ({ tag: f.tag, label: f.label, group: f.group, kind: 'value' })),

    ...rolls.map((r): Target => ({
      tag: incomingTagOf(r.tag),
      label: `Против меня: ${r.label.toLowerCase()}`,
      group: 'Броски по мне',
      kind: 'roll',
      from: r.tag,
    })),

    ...system.fields.filter(f => f.value.kind === 'stored').map((f): Target => ({
      tag: incomingTagOf(f.tag),
      label: `Входящее: ${f.label}`,
      group: f.group,
      kind: 'incoming',
      from: f.tag,
    })),

    ...Object.entries(system.events || {}).map(([id, event]): Target => ({
      tag: eventTagOf(id),
      label: `Входящее событие: ${event.label || id}`,
      group: 'События',
      kind: 'event',
      from: id,
    })),
  ];
}

export function findTarget(system: System, tag: string): Target | null {
  return targets(system).find(t => t.tag === tag) || null;
}

export function assertTarget(system: System, tag: string, fromLabel?: string): Target {
  const target = findTarget(system, tag);
  if (!target) throw new UnknownTagError(tag, fromLabel);
  return target;
}

export function labelOf(system: System, tag: string): string {
  const target = findTarget(system, tag);
  return target ? target.label : tag;
}
