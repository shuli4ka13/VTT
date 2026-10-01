import type { EmittedEvent } from '../engine/rule.ts';
import type { Clock } from '../engine/clock.ts';
import type { System, Sheet, Compendium, Die } from '../model/types.ts';

export interface WorldContext {
  system: System;
  compendium: Compendium;
  die: Die;

  clock?: Clock | null;

  shared?: Sheet[] | null;
}

export interface Report {
  kind: string;
  effect: string;
  from: string;
  label: string;
  reply: boolean;
  trace: Record<string, unknown>[];
  stopped: unknown;
  changes: unknown[];
  effects: string[];
  removed: string[];
  spent: string[];

  emitted: EmittedEvent[];

  reactions?: Report[];
}

export type ReactionWindow = 'sender' | 'target' | 'after';

export interface Offer { id: string; label: string; cost?: string; claims: string[] }
