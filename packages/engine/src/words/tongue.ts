import { EN } from './en/index.ts';

export type Tongue = 'ru' | 'en';

export const tongueOf = (lang: string | null | undefined): Tongue => (lang === undefined || lang === null || lang === 'ru' ? 'ru' : 'en');

let current: Tongue = 'ru';

export const tongue = (): Tongue => current;

export const setTongue = (lang: string | null | undefined): void => { current = tongueOf(lang); };

export function inTongue<T>(lang: string | null | undefined, run: () => T): T {
  const before = current;
  current = tongueOf(lang);
  try { return run(); } finally { current = before; }
}

export const said = (text: string): string => (current === 'ru' ? text : EN[text] ?? text);

export const everySaid = (text: string): string[] => {
  const other = EN[text];
  return other !== undefined && other !== text ? [text, other] : [text];
};

const IDS = new WeakMap<TemplateStringsArray, string>();

export const phraseOf = (strings: readonly string[]): string =>
  strings.reduce((out, part, at) => (at ? `${out}{${at - 1}}${part}` : part), '');

const idOf = (strings: TemplateStringsArray): string => {
  let id = IDS.get(strings);
  if (id === undefined) {
    id = phraseOf(strings);
    IDS.set(strings, id);
  }
  return id;
};

export function tr(strings: TemplateStringsArray, ...values: unknown[]): string {
  const template = current === 'ru' ? undefined : EN[idOf(strings)];
  if (template === undefined) {
    let out = strings[0]!;
    for (let at = 0; at < values.length; at++) out += `${values[at] as string}${strings[at + 1]!}`;
    return out;
  }
  return template.replace(/\{(\d+)\}/g, (_, at: string) => `${values[Number(at)] as string}`);
}

const SPOKEN = /[Ѐ-ӿ]/u;

const plainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

const SPOKEN_ONCE = new Set<string>();

const SOURCES = new WeakMap<object, unknown>();

function place(target: object, key: string | number, value: unknown): void {
  if (typeof value === 'string' && SPOKEN.test(value)) {
    SPOKEN_ONCE.add(value);
    Object.defineProperty(target, key, { enumerable: true, get: () => said(value) });
  } else (target as Record<string | number, unknown>)[key] = live(value);
}

export function live<T>(source: T): T {
  if (Array.isArray(source)) {
    const out: unknown[] = [];
    source.forEach((item, at) => place(out, at, item));
    SOURCES.set(out, source);
    return out as T;
  }
  if (plainObject(source)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source)) place(out, key, source[key]);
    SOURCES.set(out, source);
    return out as T;
  }
  return source;
}

export const sourceOf = <T>(table: T): T => (table && typeof table === 'object' ? (SOURCES.get(table) as T | undefined) ?? table : table);

export const liveWords = (): ReadonlySet<string> => SPOKEN_ONCE;
