import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { world as W } from '@vtt/schema';
import type { System, Compendium, Sheet, Effect, Field } from '@vtt/schema';
import { lazyStorage } from './lazy-storage.ts';
import { blockOf } from '@vtt/engine/model/blocks';

export type WorkMode = 'system' | 'compendium';

export interface Origin {
  mode: WorkMode;
  systemId?: string;
  systemTitle?: string;
  systemMine?: boolean;
  compendiumId?: string;
  compendiumTitle?: string;
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
  activeRecordId: string | null;
  activeSheetId: string | null;
  activeTab: ConstructorTab;
  activeStepIndex: number | null;
  activeTableId: string | null;

  pick: (what: Partial<Pick<WorldState,
    'activeFieldTag' | 'activeGroupName' | 'activeEffectId' | 'activeRecordKind' | 'activeRecordId' | 'activeSheetId'
    | 'activeTab' | 'activeStepIndex' | 'activeTableId'>>) => void;

  editSystem: (edit: (draft: System) => void) => void;
  editEffect: (id: string, edit: (draft: Effect) => void) => void;
  editField: (tag: string, edit: (draft: Field) => void) => void;
  editRules: (edit: (draft: System) => void) => void;
  editCompendium: (edit: (draft: Compendium) => void) => void;
  editSheets: (edit: (draft: Sheet[]) => void) => void;

  replaceWorld: (world: { system: System; compendium: Compendium; sheets: Sheet[] }) => void;
  setOrigin: (patch: Partial<Origin>) => void;
}

export const emptySystem = (): System => ({
  id: 'new-system',
  name: 'Новая система',
  fields: [],
  effects: {},
  room_rules: [],
  records: {},
  constants: {},
  tables: {},
  rolls: [],
});

const BROKEN_KEY = 'vtt.world.broken';

let restoreProblem: string | null = null;

const worldStorage = lazyStorage(() => localStorage);

export const useWorld = create<WorldState>()(persist(set => ({
  system: emptySystem(),
  compendium: { items: [], actions: [] },
  sheets: [],
  origin: { mode: 'system' },

  activeFieldTag: null,
  activeGroupName: null,
  activeEffectId: null,
  activeRecordKind: null,
  activeRecordId: null,
  activeSheetId: null,
  activeTab: 'sheet',
  activeStepIndex: null,
  activeTableId: null,

  pick: what => set(what),

  editSystem: edit => set(state => {
    const draft = structuredClone(state.system);
    edit(draft);
    return { system: draft };
  }),

  editEffect: (id, edit) => set(state => {
    const current = state.system.effects[id];
    if (!current) return {};
    const draft = structuredClone(current);
    edit(draft);
    return { system: { ...state.system, effects: { ...state.system.effects, [id]: draft } } };
  }),

  editField: (tag, edit) => set(state => {
    const at = state.system.fields.findIndex(f => f.tag === tag);
    const current = state.system.fields[at];
    if (!current) return {};
    const draft = structuredClone(current);
    edit(draft);
    const fields = [...state.system.fields];
    fields[at] = draft;
    return { system: { ...state.system, fields } };
  }),

  editRules: edit => set(state => {
    const { effects, fields, ...rest } = state.system;
    const draft = { ...structuredClone(rest), effects, fields } as System;
    edit(draft);
    if (draft.effects !== effects || draft.fields !== fields) {
      throw new Error('editRules правит словари; эффекты и поля правят editEffect и editField');
    }
    return { system: draft };
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
    activeGroupName: null,
    activeEffectId: null,
    activeRecordKind: null,
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

export const fieldsByGroup = (system: System): [string, Field[]][] => {
  const groups = new Map<string, Field[]>();
  for (const field of system.fields) {
    const key = field.group ?? 'Без блока';
    const list = groups.get(key);
    if (list) list.push(field);
    else groups.set(key, [field]);
  }
  return [...groups];
};

export const effectsByCategory = (system: System): [string, [string, Effect][]][] => {
  const groups = new Map<string, [string, Effect][]>();
  for (const [id, effect] of Object.entries(system.effects)) {
    const key = blockOf(system, effect) ?? 'Без блока';
    const list = groups.get(key);
    if (list) list.push([id, effect]);
    else groups.set(key, [[id, effect]]);
  }
  return [...groups];
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
