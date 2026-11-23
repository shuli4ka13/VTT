import i18next from 'i18next';
import { initReactI18next, useTranslation, Trans } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useLocale } from '../store/locale.ts';
import ruCommon from './ru/common.json';
import ruGate from './ru/gate.json';
import ruAuthor from './ru/author.json';
import ruConstructor from './ru/constructor.json';
import ruRules from './ru/rules.json';
import ruPlay from './ru/play.json';
import enCommon from './en/common.json';
import enGate from './en/gate.json';
import enAuthor from './en/author.json';
import enConstructor from './en/constructor.json';
import enRules from './en/rules.json';
import enPlay from './en/play.json';

export const AREAS = ['common', 'gate', 'author', 'constructor', 'rules', 'play'] as const;
export type Area = typeof AREAS[number];

const instance = i18next.createInstance();

void instance.use(initReactI18next).init({
  initAsync: false,
  lng: useLocale.getState().lang,
  fallbackLng: 'ru',
  supportedLngs: ['ru', 'en'],
  ns: [...AREAS],
  defaultNS: 'common',
  resources: {
    ru: { common: ruCommon, gate: ruGate, author: ruAuthor, constructor: ruConstructor, rules: ruRules, play: ruPlay },
    en: { common: enCommon, gate: enGate, author: enAuthor, constructor: enConstructor, rules: enRules, play: enPlay },
  },
  interpolation: { escapeValue: false },
  returnNull: false,
});

useLocale.subscribe(state => {
  if (instance.language !== state.lang) void instance.changeLanguage(state.lang);
});

export const useT = (area: Area): TFunction => useTranslation(area, { i18n: instance }).t as unknown as TFunction;

export const t: TFunction = ((key: string, options?: object) => instance.t(key, options as never)) as unknown as TFunction;

export const langName = (code: string): string => {
  const key = `common:lang.${code}`;
  return instance.exists(key) ? instance.t(key) : code;
};

export { Trans, instance as i18n };
