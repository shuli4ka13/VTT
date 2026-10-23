import { tidyLayout } from '@vtt/engine/model/layout';
import { useMemo } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { world as W } from '@vtt/schema';
import type { System, Compendium, Sheet, Effect, Column } from '@vtt/schema';
import { lazyStorage } from './lazy-storage.ts';
import { withLibrary } from '@vtt/engine/model/owned';
import { forgetFields } from '@vtt/engine/model/sheet-columns';

const fresh = (system: System): System => { forgetFields(system); return system; };

export type WorkMode = 'system' | 'compendium';

export type Publication = 'draft' | 'live' | 'behind';

export const publicationOf = (behind?: boolean): Publication =>
  behind === undefined ? 'draft' : behind ? 'behind' : 'live';

export interface Origin {
  mode: WorkMode;
  systemId?: string;
  systemTitle?: string;
  systemMine?: boolean;
  publication?: Publication;
  compendiumId?: string;
  compendiumTitle?: string;
  lesson?: string;
}

export type ConstructorTab = 'sheet' | 'dictionaries' | 'effects' | 'records';

export interface WorldState {
  system: System;
  compendium: Compendium;
  sheets: Sheet[];
  origin: Origin;

  activeFieldTag: string | null;
  activeGroupName: string | null;
  activeEffectId: string | null;
  activeRecordKind: string | null;
  activeSheetKind: string | null;
  activeRecordId: string | null;
  activeSheetId: string | null;
  activeTab: ConstructorTab;
  activeStepIndex: number | null;
  activeTableId: string | null;
  activeColumn: { table: string; column: string } | null;
  activeIn: string | null;
  activeBlock: string | null;
  activeRow: { table: string; row: string } | null;

  pick: (what: Partial<Pick<WorldState,
    'activeFieldTag' | 'activeGroupName' | 'activeEffectId' | 'activeRecordKind' | 'activeSheetKind' | 'activeRecordId' | 'activeSheetId'
    | 'activeTab' | 'activeStepIndex' | 'activeTableId' | 'activeColumn' | 'activeBlock' | 'activeRow' | 'activeIn'>>) => void;

  editSystem: (edit: (draft: System) => void) => void;
  editEffect: (id: string, edit: (draft: Effect) => void) => void;
  editColumn: (table: string, key: string, edit: (draft: Column) => void) => void;
  editRules: (edit: (draft: System) => void) => void;
  editCompendium: (edit: (draft: Compendium) => void) => void;
  editSheets: (edit: (draft: Sheet[]) => void) => void;

  replaceWorld: (world: { system: System; compendium: Compendium; sheets: Sheet[] }) => void;
  setOrigin: (patch: Partial<Origin>) => void;
}

export const emptySystem = (): System => ({
  id: 'new-system',
  name: 'Новая система',
  effects: {},
  grants: [],
  constants: {},
  tables: {},
  rolls: [],
});

const BROKEN_KEY = 'vtt.world.broken';

let restoreProblem: string | null = null;

const worldStorage = lazyStorage(() => localStorage);

export const useWorld = create<WorldState>()(persist(set => ({
  system: emptySystem(),
  compendium: { records: [] },
  sheets: [],
  origin: { mode: 'system' },

  activeFieldTag: null,
  activeGroupName: null,
  activeEffectId: null,
  activeRecordKind: null,
  activeSheetKind: null,
  activeRecordId: null,
  activeSheetId: null,
  activeTab: 'sheet',
  activeStepIndex: null,
  activeTableId: null,
  activeColumn: null,
  activeBlock: null,
  activeRow: null,
  activeIn: null,

  pick: what => set(what),

  editSystem: edit => set(state => {
    const draft = structuredClone(state.system);
    edit(draft);
    tidyLayout(draft);
    return { system: fresh(draft) };
  }),

  editEffect: (id, edit) => set(state => {
    const current = state.system.effects[id];
    if (!current) return {};
    const draft = structuredClone(current);
    edit(draft);
    return { system: { ...state.system, effects: { ...state.system.effects, [id]: draft } } };
  }),

  editColumn: (table, key, edit) => set(state => {
    const home = state.system.tables?.[table];
    const at = (home?.columns ?? []).findIndex(c => c.key === key);
    if (!home || at < 0) return {};
    const draft = structuredClone(home.columns![at]!);
    edit(draft);
    const columns = [...home.columns!];
    columns[at] = draft;
    return { system: { ...state.system, tables: { ...state.system.tables, [table]: { ...home, columns } } } };
  }),

  editRules: edit => set(state => {
    const { effects, ...rest } = state.system;
    const draft = { ...structuredClone(rest), effects } as System;
    edit(draft);
    if (draft.effects !== effects) {
      throw new Error('editRules правит словари и таблицы; эффекты правит editEffect');
    }
    return { system: fresh(draft) };
  }),

  editCompendium: edit => set(state => {
    const draft = structuredClone(state.compendium);
    edit(draft);
    return { compendium: draft };
  }),

  editSheets: edit => set(state => {
    const draft = structuredClone(state.sheets);
    edit(draft);
    return { sheets: draft };
  }),

  setOrigin: patch => set(state => ({ origin: { ...state.origin, ...patch } })),

  replaceWorld: world => set({
    ...world,
    activeFieldTag: null,
    activeColumn: null,
    activeBlock: null,
    activeRow: null,
    activeIn: null,
    activeGroupName: null,
    activeEffectId: null,
    activeRecordKind: null,
  activeSheetKind: null,
    activeRecordId: null,
    activeSheetId: world.sheets[0]?.id ?? null,
  }),
}), {
  name: 'vtt.world',
  storage: createJSONStorage(() => worldStorage),
  partialize: state => ({
    system: state.system,
    compendium: state.compendium,
    sheets: state.sheets,
    origin: state.origin,
  }),

  merge: (saved, current) => {
    if (saved == null) return current;
    const parsed = W.world.safeParse(saved);
    const origin = (saved as { origin?: Origin })?.origin;
    if (parsed.success) return { ...current, ...parsed.data, ...(origin ? { origin } : {}) };

    const first = parsed.error.issues[0];
    restoreProblem = first
      ? `${first.path.join('.')}: ${first.message}`
      : 'формат не распознан';
    try { localStorage.setItem(BROKEN_KEY, JSON.stringify(saved)); } catch { restoreProblem += ' · копию сохранить не удалось'; }
    return current;
  },
}));

export const brokenDraft = (): string | null => localStorage.getItem(BROKEN_KEY);

export const forgetBrokenDraft = (): void => { localStorage.removeItem(BROKEN_KEY); };

export const takeRestoreProblem = (): string | null => {
  const problem = restoreProblem;
  restoreProblem = null;
  return problem;
};

export const slugOf = (label: string): string =>
  label.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '_').replace(/^_+|_+$/g, '');

export function freeId(taken: Iterable<string>, base: string): string {
  const used = new Set(taken);
  const slug = slugOf(base) || 'item';
  if (!used.has(slug)) return slug;
  for (let n = 2; ; n++) {
    const candidate = `${slug}_${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

export const randomTag = (): string => Math.random().toString(36).slice(2, 8);

export function useBook(): Compendium {
  const system = useWorld(s => s.system);
  const compendium = useWorld(s => s.compendium);
  return useMemo(() => withLibrary(system, compendium), [system, compendium]);
}
