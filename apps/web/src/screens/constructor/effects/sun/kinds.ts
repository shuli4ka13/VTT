import type { SunKind } from '@vtt/engine';

export type Frame = 'solid' | 'double' | 'dashed' | 'dotted';

export interface KindLook { cls: string; icon: string; frame: Frame }

export const KIND_ORDER: readonly SunKind[] = ['step', 'heard', 'input', 'field', 'result', 'value', 'call', 'cost', 'state', 'tag', 'seam', 'ask', 'stop', 'aside'];

export const KIND_LOOK: Record<SunKind, KindLook> = {
  step: { cls: 'sun-k--step', icon: '◆', frame: 'solid' },
  heard: { cls: 'sun-k--heard', icon: '↯', frame: 'solid' },
  input: { cls: 'sun-k--input', icon: '→', frame: 'solid' },
  field: { cls: 'sun-k--field', icon: '▤', frame: 'solid' },
  result: { cls: 'sun-k--result', icon: '◎', frame: 'double' },
  value: { cls: 'sun-k--value', icon: '=', frame: 'dotted' },
  call: { cls: 'sun-k--call', icon: '↗', frame: 'solid' },
  cost: { cls: 'sun-k--cost', icon: '¤', frame: 'dotted' },
  state: { cls: 'sun-k--state', icon: '◐', frame: 'solid' },
  tag: { cls: 'sun-k--tag', icon: '#', frame: 'solid' },
  seam: { cls: 'sun-k--seam', icon: '⚡', frame: 'dashed' },
  ask: { cls: 'sun-k--ask', icon: '?', frame: 'dashed' },
  stop: { cls: 'sun-k--stop', icon: '■', frame: 'double' },
  aside: { cls: 'sun-k--aside', icon: '∅', frame: 'dashed' },
};

export const lookOf = (kind: SunKind): KindLook => KIND_LOOK[kind];
