import { create } from 'zustand';
import type { System } from '@vtt/schema';
import type { Brought, Part } from '@vtt/engine';
import { useWorld } from './world.ts';

export interface Fresh {
  label: string;
  before: System;
  after: System;
  added: Part[];
}

export const useFresh = create<{ fresh: Fresh | null }>(() => ({ fresh: null }));

export function bring(label: string, make: (system: System) => Brought): void {
  const before = useWorld.getState().system;
  const out = make(before);
  if (!out.added.length) return;
  useWorld.setState({ system: out.system });
  useFresh.setState({ fresh: { label, before, after: out.system, added: out.added } });
}

export function undoFresh(): void {
  const fresh = useFresh.getState().fresh;
  if (!fresh || useWorld.getState().system !== fresh.after) return;
  useWorld.setState({ system: fresh.before });
  useFresh.setState({ fresh: null });
}

export function useCurrentFresh(): Fresh | null {
  const fresh = useFresh(s => s.fresh);
  const system = useWorld(s => s.system);
  return fresh && fresh.after === system ? fresh : null;
}

export function useFreshKeys(kind: Part['kind']): Set<string> {
  const fresh = useCurrentFresh();
  return new Set((fresh?.added ?? []).filter(part => part.kind === kind).map(part => part.key));
}
