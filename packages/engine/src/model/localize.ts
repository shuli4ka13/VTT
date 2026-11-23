import type { System, Compendium } from './types.ts';
import { MAIN_LANG } from '../words/langs.ts';
import { inTongue } from '../words/tongue.ts';

export const TEXT_FIELDS = ['label', 'asLabel', 'question', 'yes', 'no', 'hint', 'title', 'description', 'note'] as const;
export type TextField = typeof TEXT_FIELDS[number];
export type TextPath = readonly (string | number)[];

export interface TextEntry {
  path: TextPath;
  field: TextField;
  text: string;
  counted: boolean;
  translations: Readonly<Record<string, string>>;
}

type Node = Record<string, unknown>;

const COUNTED: ReadonlySet<string> = new Set(['label', 'asLabel', 'question', 'yes', 'no']);
const CLOSED: ReadonlySet<string> = new Set(['i18n', 'cells', 'values', 'args', 'said', 'sample', 'degrees']);

const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && !Array.isArray(value);

const isTranslations = (value: unknown): value is Record<string, Record<string, string>> =>
  isNode(value) && Object.values(value).every(fields => isNode(fields) && Object.values(fields).every(text => typeof text === 'string'));

const carries = (node: Node, field: string): boolean =>
  typeof node[field] === 'string' && (node[field] as string).trim() !== '' && (field !== 'note' || node.type === 'stop');

function visit(value: unknown, path: (string | number)[], see: (node: Node, path: TextPath) => void): void {
  if (Array.isArray(value)) { value.forEach((item, index) => visit(item, [...path, index], see)); return; }
  if (!isNode(value)) return;
  see(value, path);
  for (const [key, child] of Object.entries(value)) if (!CLOSED.has(key)) visit(child, [...path, key], see);
}

export const langsOf = (system: System): string[] => {
  const langs = (system as { langs?: unknown }).langs;
  return Array.isArray(langs) && langs.length ? langs.map(String) : [MAIN_LANG];
};

export const mainLang = (system: System): string => langsOf(system)[0] ?? MAIN_LANG;

export const inSystemTongue = <T>(system: System, run: () => T): T => inTongue(mainLang(system), run);

export const inAskedTongue = <T>(lang: string | undefined, run: () => T): T => (lang === undefined ? run() : inTongue(lang, run));

export const hasLang = (system: System, lang: string | undefined): lang is string =>
  Boolean(lang) && langsOf(system).indexOf(lang!) > 0;

export function setLangs(system: System, langs: readonly string[]): void {
  const next = [...new Set(langs.filter(Boolean))];
  const holder = system as { langs?: string[] };
  if (!next.length || (next.length === 1 && next[0] === MAIN_LANG)) delete holder.langs;
  else holder.langs = next;
}

export function dropLang(system: System, lang: string): void {
  visit(system, [], node => {
    if (!isTranslations(node.i18n)) return;
    delete node.i18n[lang];
    if (!Object.keys(node.i18n).length) delete node.i18n;
  });
  setLangs(system, langsOf(system).filter(one => one !== lang));
}

export function translatable(root: System | Compendium): TextEntry[] {
  const out: TextEntry[] = [];
  visit(root, [], (node, path) => {
    const all = isTranslations(node.i18n) ? node.i18n : {};
    for (const field of TEXT_FIELDS) {
      if (!carries(node, field)) continue;
      const translations: Record<string, string> = {};
      for (const [lang, fields] of Object.entries(all)) if (typeof fields[field] === 'string' && fields[field]) translations[lang] = fields[field]!;
      out.push({ path, field, text: node[field] as string, counted: COUNTED.has(field), translations });
    }
  });
  return out;
}

export function translate(root: System | Compendium, path: TextPath, lang: string, field: TextField, text: string): void {
  let node: unknown = root;
  for (const key of path) node = isNode(node) || Array.isArray(node) ? (node as Record<string | number, unknown>)[key] : undefined;
  if (!isNode(node)) return;
  const all: Record<string, Record<string, string>> = isTranslations(node.i18n) ? node.i18n : {};
  const own = { ...(all[lang] ?? {}) };
  const clean = text.trim();
  if (clean) own[field] = clean; else delete own[field];
  if (Object.keys(own).length) all[lang] = own; else delete all[lang];
  if (Object.keys(all).length) node.i18n = all; else delete node.i18n;
}

function overlay(value: unknown, lang: string): unknown {
  if (Array.isArray(value)) return value.map(item => overlay(item, lang));
  if (!isNode(value)) return value;
  const translations = isTranslations(value.i18n) ? value.i18n : null;
  const out: Node = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'i18n' && translations) continue;
    out[key] = CLOSED.has(key) ? child : overlay(child, lang);
  }
  const fields = translations?.[lang];
  if (fields) for (const field of TEXT_FIELDS) if (fields[field] && carries(value, field)) out[field] = fields[field];
  return out;
}

const SHOWN = new WeakMap<object, Map<string, unknown>>();

function shown<T extends object>(root: T, lang: string): T {
  const known = SHOWN.get(root) ?? SHOWN.set(root, new Map()).get(root)!;
  if (!known.has(lang)) known.set(lang, overlay(root, lang));
  return known.get(lang) as T;
}

export const localized = <T extends System>(system: T, lang: string | undefined): T =>
  (hasLang(system, lang) ? shown(system, lang) : system);

export const localizedBook = <T extends Compendium>(book: T, system: System, lang: string | undefined): T =>
  (hasLang(system, lang) ? shown(book, lang) : book);

export function untranslated(system: System): Map<string, TextEntry[]> {
  const out = new Map<string, TextEntry[]>();
  const langs = langsOf(system).slice(1);
  if (!langs.length) return out;
  const counted = translatable(system).filter(entry => entry.counted);
  for (const lang of langs) out.set(lang, counted.filter(entry => !entry.translations[lang]));
  return out;
}
