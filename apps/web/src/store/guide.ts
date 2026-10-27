import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { world as W } from '@vtt/schema';
import type { System, Compendium, Sheet } from '@vtt/schema';
import { useWorld, publicationOf } from './world.ts';
import type { Origin, ConstructorTab } from './world.ts';
import { useSession } from './session.ts';
import { settle, markClean, rememberVersion } from './autosave.ts';
import { getSystem, createSystem } from '../api/client.ts';
import { lessonOf } from '../guide/lessons/index.ts';

export interface Snapshot {
  system: System;
  compendium: Compendium;
  sheets: Sheet[];
  origin: Origin;
  tab: ConstructorTab;
}

export interface Progress { step: number; system: System }

export interface Saved {
  real: Snapshot | null;
  lessons: Record<string, Progress>;
}

export const PASSED_KEY = 'vtt.guide.passed';

export const savedKey = (): string => `vtt.guide.world.${useSession.getState().name}`;

const safe = <T>(run: () => T, fallback: T): T => { try { return run(); } catch { return fallback; } };

export const readSaved = (): Saved => safe(() => {
  const raw = JSON.parse(localStorage.getItem(savedKey()) ?? 'null') as Partial<Saved> | null;
  return { real: raw?.real ?? null, lessons: raw?.lessons && typeof raw.lessons === 'object' ? raw.lessons : {} };
}, { real: null, lessons: {} });

const writeSaved = (saved: Saved): boolean => safe(() => {
  const text = JSON.stringify(saved);
  if (!saved.real && !Object.keys(saved.lessons).length) localStorage.removeItem(savedKey());
  else localStorage.setItem(savedKey(), text);
  return !saved.real || localStorage.getItem(savedKey()) === text;
}, false);

export const readSnapshot = (): Snapshot | null => readSaved().real;

export const readPassed = (): string[] => safe(() => {
  const list = JSON.parse(localStorage.getItem(PASSED_KEY) ?? '[]') as unknown;
  return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
}, []);

const writePassed = (list: string[]): void => { safe(() => { localStorage.setItem(PASSED_KEY, JSON.stringify(list)); }, undefined); };

const stepsOf = (): Record<string, number> =>
  Object.fromEntries(Object.entries(readSaved().lessons).map(([id, entry]) => [id, entry.step]));

export interface GuideState {
  lesson: string | null;
  step: number;
  folded: boolean;
  run: number;
  note: string | null;
  passed: string[];
  started: Record<string, number>;
  marks: Record<number, System>;
  start: (id: string, again?: boolean) => Promise<boolean>;
  go: (step: number) => void;
  fold: (folded: boolean) => void;
  exit: () => Promise<boolean>;
  finish: () => Promise<boolean>;
  keep: () => Promise<boolean>;
  dismiss: () => void;
}

const marked = (id: string | null): boolean => {
  const origin = useWorld.getState().origin;
  return Boolean(id && origin.lesson === id && !origin.systemId && origin.mode === 'system');
};

const close = (note: string | null = null): void => {
  const saved = readSaved();
  if (saved.real) writeSaved({ ...saved, real: null });
  useGuide.setState({ lesson: null, step: 0, folded: false, note, started: stepsOf(), marks: {} });
};

async function giveBack(real: Snapshot): Promise<string | null> {
  const world = useWorld.getState();
  const systemId = real.origin?.systemId;
  let publication = real.origin?.publication;
  if (systemId) {
    try {
      const saved = await getSystem(systemId);
      rememberVersion({ system: saved.updatedAt, compendium: undefined });
      publication = publicationOf(saved.behind);
      world.replaceWorld({ system: saved.system, compendium: real.compendium, sheets: real.sheets });
    } catch (err) {
      return `вернуть вашу систему не удалось: ${(err as Error).message} — попробуйте ещё раз`;
    }
  } else {
    const parsed = W.world.safeParse({ system: real.system, compendium: real.compendium, sheets: real.sheets });
    if (!parsed.success) return 'запомненная система не прошла проверку';
    world.replaceWorld(parsed.data as never);
  }
  useWorld.setState({ origin: publication ? { ...real.origin, publication } : real.origin });
  world.pick({ activeTab: real.tab ?? 'sheet', activeTableId: null, activeStepIndex: null, activeSheetKind: null });
  markClean();
  return null;
}

export const useGuide = create<GuideState>()(persist((set, get) => ({
  lesson: null,
  step: 0,
  folded: false,
  run: 0,
  note: null,
  passed: readPassed(),
  started: stepsOf(),
  marks: {},

  start: async (id, again = false) => {
    const lesson = lessonOf(id);
    if (!lesson) return false;
    if (!await settle()) {
      set({ note: 'урок не начат: последние правки не сохранились — причина в шапке' });
      return false;
    }
    const world = useWorld.getState();
    const saved = readSaved();
    const running = get().lesson;
    if (running && marked(running) && saved.real) {
      saved.lessons[running] = { step: get().step, system: world.system };
    } else {
      saved.real = { system: world.system, compendium: world.compendium, sheets: world.sheets, origin: world.origin, tab: world.activeTab };
    }
    if (again) delete saved.lessons[id];
    const entry = saved.lessons[id];
    if (!writeSaved(saved)) {
      set({ note: 'урок не начат: вашу систему сохранить не удалось' });
      return false;
    }
    const step = Math.min(entry?.step ?? 0, lesson.steps.length - 1);
    set({ lesson: lesson.id, step, folded: false, note: null, run: get().run + 1, started: stepsOf() });
    useWorld.setState({ origin: { mode: 'system', systemTitle: lesson.title, lesson: lesson.id } });
    world.replaceWorld({ system: structuredClone(entry?.system ?? lesson.seed), compendium: { records: [] }, sheets: [] });
    set({ marks: { [step]: structuredClone(useWorld.getState().system) } });
    world.pick({ activeTab: lesson.tab, activeTableId: null, activeStepIndex: null, activeSheetKind: null, activeEffectId: null, activeFieldTag: null });
    markClean();
    return true;
  },

  go: step => {
    const now = get().step;
    const world = useWorld.getState();
    const marks = Object.fromEntries(Object.entries(get().marks).filter(([at]) => Number(at) <= step));
    if (step > now) marks[step] = structuredClone(world.system);
    const back = step < now ? get().marks[step] : undefined;
    if (back) {
      world.replaceWorld({ system: structuredClone(back), compendium: world.compendium, sheets: world.sheets });
      markClean();
    }
    set({ step, note: null, marks });
  },

  fold: folded => set({ folded }),

  dismiss: () => set({ note: null }),

  exit: async () => {
    const id = get().lesson;
    if (!id) return true;
    const saved = readSaved();
    if (!marked(id) || !saved.real) { close(); return true; }
    saved.lessons[id] = { step: get().step, system: useWorld.getState().system };
    writeSaved(saved);
    const trouble = await giveBack(saved.real);
    if (trouble) { set({ note: trouble }); return false; }
    close();
    return true;
  },

  finish: async () => {
    const id = get().lesson;
    if (!id) return true;
    const saved = readSaved();
    if (marked(id) && saved.real) {
      const trouble = await giveBack(saved.real);
      if (trouble) { set({ note: trouble }); return false; }
    }
    delete saved.lessons[id];
    writeSaved({ ...saved, real: null });
    const passed = [...new Set([...readPassed(), id])];
    writePassed(passed);
    set({ passed });
    close();
    return true;
  },

  keep: async () => {
    const id = get().lesson;
    if (!id || !marked(id)) return false;
    const system = useWorld.getState().system;
    const title = system.name?.trim() || lessonOf(id)?.title || 'Учебная система';
    try {
      const made = await createSystem(title, system);
      rememberVersion({ system: made.updatedAt, compendium: undefined });
      useWorld.setState({ origin: { mode: 'system', systemId: made.id, systemTitle: title, systemMine: true } });
      markClean();
    } catch (err) {
      set({ note: `сохранить как новую систему не удалось: ${(err as Error).message}` });
      return false;
    }
    const saved = readSaved();
    delete saved.lessons[id];
    writeSaved({ ...saved, real: null });
    close();
    return true;
  },
}), {
  name: 'vtt.guide',
  storage: createJSONStorage(() => localStorage),
  partialize: state => ({ lesson: state.lesson, step: state.step, marks: state.marks }),
  merge: (saved, current) => {
    const raw = (saved ?? {}) as { lesson?: unknown; step?: unknown; marks?: unknown };
    const lesson = typeof raw.lesson === 'string' && lessonOf(raw.lesson) ? raw.lesson : null;
    const step = typeof raw.step === 'number' && Number.isInteger(raw.step) && raw.step >= 0 ? raw.step : 0;
    const marks = lesson && raw.marks && typeof raw.marks === 'object' ? raw.marks as Record<number, System> : {};
    return { ...current, lesson, step: lesson ? step : 0, marks };
  },
}));

export function reconcile(): void {
  const origin = useWorld.getState().origin;
  const real = readSnapshot();
  const { lesson } = useGuide.getState();
  if (origin.lesson && !real) {
    useWorld.setState({ origin: { ...origin, lesson: undefined } });
    close('учебная копия осталась без вашей системы — откройте её через «сменить»');
    return;
  }
  if (real && (!origin.lesson || origin.lesson !== lesson || origin.systemId)) { close(); return; }
  if (lesson && !marked(lesson)) close();
}

let hydrated = false;

const afterBoth = (): void => {
  if (hydrated || !useWorld.persist.hasHydrated() || !useGuide.persist.hasHydrated()) return;
  hydrated = true;
  reconcile();
  useWorld.subscribe((state, before) => {
    const { lesson } = useGuide.getState();
    if (lesson && state.origin !== before.origin && !marked(lesson)) close();
  });
};

useWorld.persist.onFinishHydration(afterBoth);
useGuide.persist.onFinishHydration(afterBoth);
afterBoth();
