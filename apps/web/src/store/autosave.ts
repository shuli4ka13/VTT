import { create } from 'zustand';
import { useWorld } from './world.ts';
import { saveSystem, saveCompendium } from '../api/client.ts';

const PAUSE = 1500;

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: string }
  | { kind: 'failed'; why: string };

interface AutosaveState {
  state: SaveState;
  set: (next: SaveState) => void;
}

export const useAutosave = create<AutosaveState>()(set => ({
  state: { kind: 'idle' },
  set: next => set({ state: next }),
}));

const clock = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

let versions: { system?: string; compendium?: string } = {};
let sent = '';
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: (() => Promise<void>) | null = null;

export const rememberVersion = (patch: { system?: string; compendium?: string }): void => {
  versions = { ...versions, ...patch };
  sent = '';
};

async function flush(): Promise<void> {
  if (!pending) return;
  const job = pending;
  pending = null;
  if (timer) { clearTimeout(timer); timer = null; }
  await job();
}

function schedule(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  pending = null;

  const { system, compendium, origin } = useWorld.getState();
  const { mode, systemId, compendiumId, compendiumTitle } = origin;

  const target = mode === 'system' ? systemId : compendiumId;
  if (!target) return;

  const title = mode === 'system'
    ? (system.name ?? 'Без имени')
    : (compendiumTitle ?? 'Без имени');
  const snapshot = JSON.stringify({ mode, title, body: mode === 'system' ? system : compendium });
  if (snapshot === sent) return;

  pending = async () => {
    useAutosave.getState().set({ kind: 'saving' });
    try {
      if (mode === 'system') {
        const saved = await saveSystem(target, title, system, versions.system);
        versions.system = saved.updatedAt;
      } else {
        const book = await saveCompendium(
          target, title, systemId!, compendium, versions.compendium);
        versions.compendium = book.updatedAt;
      }
      sent = snapshot;
      useAutosave.getState().set({ kind: 'saved', at: clock() });
    } catch (err) {
      useAutosave.getState().set({ kind: 'failed', why: (err as Error).message });
    }
  };

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void flush(); }, PAUSE);
}

useWorld.subscribe(schedule);

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
  window.addEventListener('pagehide', () => { void flush(); });
}
