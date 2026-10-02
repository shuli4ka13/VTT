import type { EmittedEvent } from '../engine/rule.ts';

export interface Change { tag: string; from: unknown; to: unknown; sheetId?: string }

export interface Stop { step: string | number; type: string; reason?: string; note?: string }

export interface Report {
  kind: 'effect' | 'cost' | 'moment';
  effect: string;
  from: string;
  label: string;
  reply: boolean;
  trace: Record<string, unknown>[];
  stopped: Stop | null;
  changes: Change[];
  effects: string[];
  removed: string[];
  spent: string[];
  emitted: EmittedEvent[];
  reactions?: Report[];
}

export type Entry =
  | { fromId: string; toId: string; report: Report; hidden?: boolean }
  | { text: string; hidden?: boolean };

export const isText = (entry: Entry): entry is { text: string; hidden?: boolean } => 'text' in entry;
