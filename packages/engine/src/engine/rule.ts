export interface Change { tag: string; from: unknown; to: unknown }

export interface StopReason { step: string | number; type: string; reason?: string; note?: string }

export interface EmittedEvent { event: string; amount: number; incoming: number; tags: string[] }

export interface NestedRun { results: Record<string, unknown>; stopped: StopReason | null }
