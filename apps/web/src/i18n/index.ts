import i18next from 'i18next';
import { initReactI18next, useTranslation, Trans } from 'react-i18next';
import type { TFunction } from 'i18next';
import { langsOf } from '@vtt/engine';
import { useLocale } from '../store/locale.ts';

export const AREAS = [
  'common', 'data', 'gate', 'author', 'app', 'book', 'guide',
  'constructor', 'sheetTab', 'records', 'fields', 'readback', 'phrases',
  'rules', 'tables', 'rolls',
  'effects', 'params', 'rollCards', 'stepCards',
  'play', 'sheet', 'ui',
] as const;
export type Area = typeof AREAS[number];

export const UI_LANGS = ['ru', 'en'] as const;

type Dictionary = Record<string, unknown>;

const files = import.meta.glob<Dictionary>(['./ru/*.json', './en/*.json'], { eager: true, import: 'default' });

const resources: Record<string, Record<string, Dictionary>> = {};
for (const [path, dictionary] of Object.entries(files)) {
  const found = /^\.\/([a-z]+)\/([A-Za-z]+)\.json$/.exec(path);
  if (found) (resources[found[1]!] ??= {})[found[2]!] = dictionary;
}

const strict = import.meta.env.MODE === 'test';

const instance = i18next.createInstance();

void instance.use(initReactI18next).init({
  initAsync: false,
  lng: useLocale.getState().lang,
  fallbackLng: 'ru',
  supportedLngs: [...UI_LANGS],
  ns: [...AREAS],
  defaultNS: 'common',
  resources,
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

export const useT = (area: Area): TFunction => useTranslation(area, { i18n: instance }).t as unknown as TFunction;

export const t: TFunction = ((key: string, options?: object) => instance.t(key, options as never)) as unknown as TFunction;

export const dataLang = (system: { langs?: readonly string[] } | null | undefined): string => {
  const main = system ? langsOf(system as never)[0] ?? 'ru' : 'ru';
  return (UI_LANGS as readonly string[]).includes(main) ? main : 'en';
};

export const dataT = (system: { langs?: readonly string[] } | null | undefined): TFunction =>
  instance.getFixedT(dataLang(system)) as unknown as TFunction;

export const langName = (code: string): string => {
  const key = `common:lang.${code}`;
  return instance.exists(key) ? instance.t(key) : code;
};

export { Trans, instance as i18n };
