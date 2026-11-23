import { AsyncLocalStorage } from 'node:async_hooks';
import { tongueOf } from '@vtt/engine';
import { EN } from './words.en.ts';

const asked = new AsyncLocalStorage<string>();

export const langOf = (header: string | null | undefined): string =>
  tongueOf(String(header ?? '').split(',')[0]?.split(';')[0]?.trim() || undefined);

export const langNow = (): string => asked.getStore() ?? 'ru';

export const inLang = <T>(lang: string | null | undefined, run: () => T): T => asked.run(langOf(lang), run);

export const speakIn = (lang: string | null | undefined): void => { asked.enterWith(langOf(lang)); };

export const phraseOf = (strings: readonly string[]): string =>
  strings.reduce((out, part, at) => (at ? `${out}{${at - 1}}${part}` : part), '');

type Speaker = (strings: TemplateStringsArray, ...values: unknown[]) => string;

const speak = (lang: () => string | null | undefined): Speaker => (strings, ...values) => {
  const template = tongueOf(lang()) === 'ru' ? undefined : EN[phraseOf(strings)];
  if (template === undefined) return strings.reduce((out, part, at) => `${out}${at ? `${values[at - 1] as string}` : ''}${part}`, '');
  return template.replace(/\{(\d+)\}/g, (_, at: string) => `${values[Number(at)] as string}`);
};

export const say: Speaker = speak(langNow);

export const sayIn = (lang: string | null | undefined): Speaker => speak(() => lang ?? 'ru');

export const errorsCount = (n: number): string => {
  if (tongueOf(langNow()) !== 'ru') return n === 1 ? say`${n} ошибка` : say`${n} ошибок`;
  const teen = n % 100 >= 11 && n % 100 <= 14;
  const last = n % 10;
  return teen ? say`${n} ошибок` : last === 1 ? say`${n} ошибка` : last >= 2 && last <= 4 ? say`${n} ошибки` : say`${n} ошибок`;
};
