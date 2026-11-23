import { latinOf } from '../src/words/key.ts';

const WORD = /[\u0400-\u04FF]+/gu;

export const SPOKEN = /[\u0400-\u04FF]/u;

const latinLetter = (letter: string): string => {
  const out = latinOf(letter);
  return letter === letter.toLowerCase() ? out : out.charAt(0).toUpperCase() + out.slice(1);
};

const latinWord = (word: string): string => {
  const letters = [...word].map(latinLetter);
  return `${letters[0]}${latinOf(word[0]!)}${letters.slice(1).join('')}`;
};

export const latinText = (text: string): string => text.replace(WORD, latinWord);

export function latinData<T>(node: T): T {
  if (typeof node === 'string') return latinText(node) as T;
  if (Array.isArray(node)) return node.map(latinData) as T;
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, latinData(value)])) as T;
  return node;
}

export function englishWorld<T extends { system: object }>(world: T): T {
  const out = latinData(structuredClone(world));
  (out.system as { langs?: string[] }).langs = ['en'];
  return out;
}
