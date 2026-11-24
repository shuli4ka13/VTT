import { create } from 'zustand';

export type EffectView = 'form' | 'sun' | 'map';

const KEY = 'vtt.effectView';

const saved = (): EffectView => {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'sun' || value === 'map' ? value : 'form';
  } catch { return 'form'; }
};

export const useEffectView = create<{
  view: EffectView; setView: (view: EffectView) => void;
  trail: string[]; push: (id: string) => void; back: () => string | null;
  chain: string | null; openChain: (record: string) => void; closeChain: () => void;
}>((set, get) => ({
  view: saved(),
  setView: view => {
    try { localStorage.setItem(KEY, view); } catch { set({ view }); return; }
    set({ view });
  },
  chain: null,
  openChain: record => set({ chain: record }),
  closeChain: () => set({ chain: null }),
  trail: [],
  push: id => set(state => ({ trail: [...state.trail, id] })),
  back: () => {
    const trail = get().trail;
    const last = trail[trail.length - 1] ?? null;
    if (last !== null) set({ trail: trail.slice(0, -1) });
    return last;
  },
}));
