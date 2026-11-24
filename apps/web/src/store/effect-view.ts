import { create } from 'zustand';

export type EffectView = 'form' | 'sun';

const KEY = 'vtt.effectView';

const saved = (): EffectView => {
  try { return localStorage.getItem(KEY) === 'sun' ? 'sun' : 'form'; } catch { return 'form'; }
};

export const useEffectView = create<{ view: EffectView; setView: (view: EffectView) => void; trail: string[]; push: (id: string) => void; back: () => string | null }>((set, get) => ({
  view: saved(),
  setView: view => {
    try { localStorage.setItem(KEY, view); } catch { set({ view }); return; }
    set({ view });
  },
  trail: [],
  push: id => set(state => ({ trail: [...state.trail, id] })),
  back: () => {
    const trail = get().trail;
    const last = trail[trail.length - 1] ?? null;
    if (last !== null) set({ trail: trail.slice(0, -1) });
    return last;
  },
}));
