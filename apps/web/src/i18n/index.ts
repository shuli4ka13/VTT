import i18next from 'i18next';
import { initReactI18next, useTranslation, Trans } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useLocale } from '../store/locale.ts';
import ruCommon from './ru/common.json';
import ruApp from './ru/app.json';
import ruGate from './ru/gate.json';
import ruUi from './ru/ui.json';
import ruSheet from './ru/sheet.json';
import enCommon from './en/common.json';
import enApp from './en/app.json';
import enGate from './en/gate.json';
import enUi from './en/ui.json';
import enSheet from './en/sheet.json';

export const SHARED_AREAS = ['common', 'app', 'gate', 'ui', 'sheet'] as const;

export const UI_LANGS = ['ru', 'en'] as const;

export type Dictionary = Record<string, unknown>;

const strict = import.meta.env.MODE === 'test';

const instance = i18next.createInstance();

void instance.use(initReactI18next).init({
  initAsync: false,
  lng: useLocale.getState().lang,
  fallbackLng: 'ru',
  supportedLngs: [...UI_LANGS],
  ns: [...SHARED_AREAS],
  defaultNS: 'common',
  resources: {
    ru: { common: ruCommon, app: ruApp, gate: ruGate, ui: ruUi, sheet: ruSheet },
    en: { common: enCommon, app: enApp, gate: enGate, ui: enUi, sheet: enSheet },
  },
  interpolation: { escapeValue: false },
  returnNull: false,
  saveMissing: strict,
  missingKeyHandler: (_langs, area, key) => {
    if (strict) throw new Error(`i18n: no key ${area}:${key}`);
  },
});

useLocale.subscribe(state => {
  if (instance.language !== state.lang) void instance.changeLanguage(state.lang);
});

export const register = (lang: string, area: string, dictionary: Dictionary): void => {
  if (!instance.hasResourceBundle(lang, area)) instance.addResourceBundle(lang, area, dictionary);
};

export const registerFiles = (files: Record<string, Dictionary>): void => {
  for (const [path, dictionary] of Object.entries(files)) {
    const found = /^\.\/([a-z]+)\/([A-Za-z]+)\.json$/.exec(path);
    if (found) register(found[1]!, found[2]!, dictionary);
  }
};

export const useT = (area: string): TFunction => useTranslation(area, { i18n: instance }).t as unknown as TFunction;

export const t: TFunction = ((key: string, options?: object) => instance.t(key, options as never)) as unknown as TFunction;

export const langName = (code: string): string => {
  const key = `common:lang.${code}`;
  return instance.exists(key) ? instance.t(key) : code;
};

export { Trans, instance as i18n };
