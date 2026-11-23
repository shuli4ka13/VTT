import type { TFunction } from 'i18next';
import { inTongue, soleLang, MAIN_LANG } from '@vtt/engine';
import type { System } from '@vtt/schema';
import { i18n } from '../i18n/author.ts';
import { useLocale } from '../store/locale.ts';
import type { Lesson } from './types.ts';

export interface Words { t: TFunction; lang: string }

type Build = (words: Words) => Lesson;

const builds = new WeakMap<Lesson, Build>();
const made = new WeakMap<Lesson, Map<string, Lesson>>();

export const areaOf = (id: string): string =>
  `lesson${id.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`;

export function inLang(lesson: Lesson, lang: string): Lesson {
  const build = builds.get(lesson);
  if (!build) return lesson;
  const known = made.get(lesson)!;
  let out = known.get(lang);
  if (!out) {
    out = inTongue(lang, () => build({ t: i18n.getFixedT(lang) as unknown as TFunction, lang }));
    known.set(lang, out);
  }
  return out;
}

export function lazyLesson(id: string, build: Build, langs?: readonly string[]): Lesson {
  const now = (): Lesson => inLang(lesson, useLocale.getState().lang);
  const lesson: Lesson = {
    id,
    ...(langs ? { langs } : {}),
    get title() { return now().title; },
    get sub() { return now().sub; },
    get start() { return now().start; },
    get seed() { return now().seed; },
    get tab() { return now().tab; },
    get chapters() { return now().chapters; },
    get steps() { return now().steps; },
  };
  builds.set(lesson, build);
  made.set(lesson, new Map());
  return lesson;
}

export const seedIn = (seed: System, words: Words): System =>
  ({ ...soleLang(seed, words.lang), name: words.t('guide:seedName') });

export const blankSeed = (words: Words): System => ({
  id: 'uchebnaya',
  name: words.t('guide:seedName'),
  ...(words.lang === MAIN_LANG ? {} : { langs: [words.lang] }),
  effects: {},
  grants: [],
  constants: {},
  tables: {},
} as System);

export const namesOf = (id: string, lang: string): string[] => {
  const names = i18n.getFixedT(lang)(`${areaOf(id)}:name`, { returnObjects: true, defaultValue: {} }) as unknown;
  const out: [string, string][] = [];
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string') out.push([path, node]);
    else if (node && typeof node === 'object') Object.entries(node).forEach(([key, inner]) => walk(inner, `${path}.${key}`));
  };
  walk(names, '');
  return out.sort((a, b) => a[0].localeCompare(b[0])).map(([, text]) => text);
};

export const offered = (lesson: Lesson, lang: string = useLocale.getState().lang): boolean => !lesson.langs || lesson.langs.includes(lang);
