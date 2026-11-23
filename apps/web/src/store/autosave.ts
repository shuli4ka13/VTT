import { create } from 'zustand';
import { useWorld } from './world.ts';
import { saveSystem, createSystem, saveCompendium, ApiError } from '../api/client.ts';
import { dataT, t } from '../i18n/author.ts';

const PAUSE = 1500;

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: string }
  | { kind: 'failed'; why: string; issues: string[] };

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

export async function settle(): Promise<boolean> {
  if (typeof document !== 'undefined') (document.activeElement as HTMLElement | null)?.blur?.();
  await flush();
  return useAutosave.getState().state.kind !== 'failed';
}

export const saveLabel = (state: SaveState, idle: string): string =>
  state.kind === 'saving' ? t('author:save.saving')
    : state.kind === 'dirty' ? t('author:save.dirty')
      : state.kind === 'saved' ? t('author:save.saved', { at: state.at })
        : state.kind === 'failed' ? t('author:save.failed', { why: [state.why, ...state.issues.slice(0, 2)].join(' · ') })
          : idle;

function snapshotOf(): string {
  const { system, compendium, origin } = useWorld.getState();
  const { mode, compendiumTitle } = origin;
  const td = dataT(system);
  const title = mode === 'system'
    ? (system.name ?? td('author:save.untitled'))
    : (compendiumTitle ?? td('author:save.untitled'));
  return JSON.stringify({ mode, title, body: mode === 'system' ? system : compendium });
}

export function markClean(): void {
  sent = snapshotOf();
  pending = null;
  if (timer) { clearTimeout(timer); timer = null; }
  useAutosave.getState().set({ kind: 'idle' });
}

function schedule(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  pending = null;

  const { system, compendium, origin } = useWorld.getState();
  const { mode, systemId, compendiumId, compendiumTitle } = origin;

  const target = mode === 'system' ? systemId : compendiumId;
  if (!target) return;

  const td = dataT(system);
  const title = mode === 'system'
    ? (system.name ?? td('author:save.untitled'))
    : (compendiumTitle ?? td('author:save.untitled'));
  const snapshot = JSON.stringify({ mode, title, body: mode === 'system' ? system : compendium });
  if (snapshot === sent) return;

  pending = async () => {
    useAutosave.getState().set({ kind: 'saving' });
    try {
      if (mode === 'system') {
        const saved = await saveSystem(target, title, system, versions.system).catch(async err => {
          if (!(err instanceof ApiError) || err.status !== 404) throw err;
          const fresh = await createSystem(title, system);
          useWorld.getState().setOrigin({ systemId: fresh.id, systemMine: true, publication: 'draft' });
          return fresh;
        });
        versions.system = saved.updatedAt;
      } else {
        const book = await saveCompendium(
          target, title, systemId!, compendium, versions.compendium);
        versions.compendium = book.updatedAt;
      }
      sent = snapshot;
      useAutosave.getState().set({ kind: 'saved', at: clock() });
    } catch (err) {
      useAutosave.getState().set({
        kind: 'failed',
        why: (err as Error).message,
        issues: err instanceof ApiError ? err.issues : [],
      });
    }
  };

  useAutosave.getState().set({ kind: 'dirty' });
  if (mode === 'system' && origin.publication === 'live') useWorld.getState().setOrigin({ publication: 'behind' });

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void flush(); }, PAUSE);
}

useWorld.subscribe(schedule);
if (useWorld.persist.hasHydrated()) schedule();
else useWorld.persist.onFinishHydration(() => schedule());

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
  window.addEventListener('pagehide', () => { void flush(); });
}
