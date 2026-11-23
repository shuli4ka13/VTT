import { create } from 'zustand';

export type Lang = 'ru' | 'en';

const KEY = 'vtt.lang';
const SHOWN_KEY = 'vtt.shown';

const saved = (): Lang => {
  try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'ru'; } catch { return 'ru'; }
};

const savedShown = (): string | null => {
  try { return localStorage.getItem(SHOWN_KEY) || null; } catch { return null; }
};

export const useLocale = create<{ lang: Lang; setLang: (lang: Lang) => void; shown: string | null; setShown: (shown: string | null) => void }>(set => ({
  lang: saved(),
  setLang: lang => {
    try { localStorage.setItem(KEY, lang); } catch { set({ lang }); return; }
    set({ lang });
  },
  shown: savedShown(),
  setShown: shown => {
    try {
      if (shown) localStorage.setItem(SHOWN_KEY, shown); else localStorage.removeItem(SHOWN_KEY);
    } catch { set({ shown }); return; }
    set({ shown });
  },
}));

export const viewerLang = (state: { lang: Lang; shown: string | null }): string => state.shown ?? state.lang;
