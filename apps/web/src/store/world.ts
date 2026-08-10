// Состояние мира в конструкторе. Zustand: правки автора живут локально
// и уезжают на сервер публикацией — конструктор не держит соединения
// и работает без сети.
//
// Все правки — чистые операции над данными. Ни одна из них не считает
// значений: считать в конструкторе не по чему, персонажа там нет.

import { create } from 'zustand';
import type { System, Compendium, Sheet, Effect, Field } from '@vtt/schema';

export interface WorldState {
  system: System;
  compendium: Compendium;
  sheets: Sheet[];

  /** Что выбрано на экранах. Часть состояния интерфейса, не мира. */
  activeFieldTag: string | null;
  activeEffectId: string | null;
  activeRecordKind: string | null;
  activeRecordId: string | null;
  activeSheetId: string | null;

  pick: (what: Partial<Pick<WorldState,
    'activeFieldTag' | 'activeEffectId' | 'activeRecordKind' | 'activeRecordId' | 'activeSheetId'>>) => void;

  /** Правка системы одним замыканием: чтобы не плодить сеттер на каждое поле. */
  editSystem: (edit: (draft: System) => void) => void;
  editCompendium: (edit: (draft: Compendium) => void) => void;
  editSheets: (edit: (draft: Sheet[]) => void) => void;

  replaceWorld: (world: { system: System; compendium: Compendium; sheets: Sheet[] }) => void;
}

/** Пустая система: конструктор открывается с чистого листа, образцы — доноры. */
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
  action_types: {},
});

export const useWorld = create<WorldState>(set => ({
  system: emptySystem(),
  compendium: { items: [], actions: [] },
  sheets: [],

  activeFieldTag: null,
  activeEffectId: null,
  activeRecordKind: null,
  activeRecordId: null,
  activeSheetId: null,

  pick: what => set(what),

  // structuredClone перед правкой: React сравнивает по ссылке, и мутация
  // на месте не вызвала бы перерисовку — самая частая ловушка Zustand.
  editSystem: edit => set(state => {
    const draft = structuredClone(state.system);
    edit(draft);
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

  replaceWorld: world => set({
    ...world,
    activeFieldTag: null,
    activeEffectId: null,
    activeRecordKind: null,
    activeRecordId: null,
    activeSheetId: world.sheets[0]?.id ?? null,
  }),
}));

// ── производные выборки ─────────────────────────────────────────────────
// Читаются на месте, а не хранятся: хранимое и вычисляемое разделены
// и в состоянии интерфейса тоже.

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
    const key = effect.category ?? 'Механики';
    const list = groups.get(key);
    if (list) list.push([id, effect]);
    else groups.set(key, [[id, effect]]);
  }
  return [...groups];
};

/** Свободный машинный идентификатор из человеческого имени. */
export function freeId(taken: Iterable<string>, base: string): string {
  const used = new Set(taken);
  const slug = base
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '') || 'item';
  if (!used.has(slug)) return slug;
  for (let n = 2; ; n++) {
    const candidate = `${slug}_${n}`;
    if (!used.has(candidate)) return candidate;
  }
}
