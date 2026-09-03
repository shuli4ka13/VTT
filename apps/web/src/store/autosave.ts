import { useEffect, useRef, useState } from 'react';
import { useWorld } from './world.ts';
import { saveSystem, saveCompendium } from '../api/client.ts';

const PAUSE = 1500;

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: string }
  | { kind: 'failed'; why: string };

export function useAutosave(): SaveState {
  const system = useWorld(s => s.system);
  const compendium = useWorld(s => s.compendium);
  const origin = useWorld(s => s.origin);

  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const sent = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const { systemId, compendiumId } = origin;
    if (!systemId) return;

    const title = system.name ?? 'Без имени';
    const snapshot = JSON.stringify({ title, system, compendium, compendiumId });
    if (snapshot === sent.current) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setState({ kind: 'saving' });
      const jobs = [saveSystem(systemId, title, system)];
      if (compendiumId) {
        jobs.push(saveCompendium(compendiumId, origin.compendiumTitle ?? title, systemId, compendium));
      }
      Promise.all(jobs)
        .then(() => {
          sent.current = snapshot;
          setState({ kind: 'saved', at: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) });
        })
        .catch(err => setState({ kind: 'failed', why: (err as Error).message }));
    }, PAUSE);

    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [system, compendium, origin]);

  return state;
}
