// Состояние мира в конструкторе. Zustand: правки автора живут локально
// и уезжают на сервер публикацией — конструктор не держит соединения
// и работает без сети.
//
// Все правки — чистые операции над данными. Ни одна из них не считает
// значений: считать в конструкторе не по чему, персонажа там нет.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { world as W } from '@vtt/schema';
import type { System, Compendium, Sheet, Effect, Field } from '@vtt/schema';
import { unifyRecordRefs } from '@vtt/engine/model/unify';

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

// Мир переживает перезагрузку страницы. Без этого автор терял работу
// на первом же случайном F5 — а конструктор systems это часы работы.
// Сохраняется ТОЛЬКО мир; что выбрано на экранах — состояние интерфейса,
// и восстанавливать его через сутки бессмысленно.
export const useWorld = create<WorldState>()(persist(set => ({
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
    system: unifyRecordRefs(world.system),
    activeFieldTag: null,
    activeEffectId: null,
    activeRecordKind: null,
    activeRecordId: null,
    activeSheetId: world.sheets[0]?.id ?? null,
  }),
}), {
  name: 'vtt.world',
  storage: createJSONStorage(() => localStorage),
  partialize: state => ({
    system: state.system,
    compendium: state.compendium,
    sheets: state.sheets,
  }),
  // Сохранённый мир мог быть записан прежней версией — и не пройти нынешнюю
  // схему. Молча подсунуть его значило бы получить отказ при публикации,
  // причём непонятно когда и почему. Поэтому проверяем на входе: не прошёл —
  // начинаем с чистого листа и говорим об этом вслух.
  merge: (saved, current) => {
    const parsed = W.world.safeParse(saved);
    if (parsed.success) return { ...current, ...parsed.data };

    const first = parsed.error.issues[0];
    restoreProblem = first
      ? `${first.path.join('.')}: ${first.message}`
      : 'формат не распознан';
    return current;
  },
  // Сохранённый мир мог быть записан до унификации ссылок на записи: прямые
  // {prop} в слотах шагов конвертируются в потребности эффекта один раз,
  // сразу после гидрации — так же, как при загрузке файла в replaceWorld.
  onRehydrateStorage: () => state => {
    if (state) state.system = unifyRecordRefs(state.system);
  },
}));

/**
 * Почему сохранённый мир не восстановился. Забирается один раз при старте:
 * человеку надо сказать, что его работа не открылась, а не делать вид,
 * будто он всегда начинал с нуля.
 */
let restoreProblem: string | null = null;

export const takeRestoreProblem = (): string | null => {
  const problem = restoreProblem;
  restoreProblem = null;
  return problem;
};

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
    .replace(/[^a-zа-яё0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '') || 'item';
  if (!used.has(slug)) return slug;
  for (let n = 2; ; n++) {
    const candidate = `${slug}_${n}`;
    if (!used.has(candidate)) return candidate;
  }
}
