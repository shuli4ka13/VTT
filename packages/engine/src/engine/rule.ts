import type { Bound } from './refs.ts';
export interface Change { tag: string; from: unknown; to: unknown }

export interface StopReason { step: string | number; type: string; reason?: string; note?: string }

export interface EmittedEvent { event: string; amount: number; incoming: number; tags: string[]; names?: Record<string, Bound>; values?: Record<string, unknown> }

export interface NestedRun { results: Record<string, unknown>; stopped: StopReason | null; returns?: Record<string, unknown>; landed?: boolean }
