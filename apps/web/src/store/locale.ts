import { create } from 'zustand';

export type Lang = 'ru' | 'en';

const KEY = 'vtt.lang';

const saved = (): Lang => {
  try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'ru'; } catch { return 'ru'; }
};

export const useLocale = create<{ lang: Lang; setLang: (lang: Lang) => void }>(set => ({
  lang: saved(),
  setLang: lang => {
    try { localStorage.setItem(KEY, lang); } catch { set({ lang }); return; }
    set({ lang });
  },
}));
