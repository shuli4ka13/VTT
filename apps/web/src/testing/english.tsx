import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { latinOf } from '@vtt/engine';
import { SAMPLE_WORLDS, PIECES } from '@vtt/engine/samples';
import type { SampleWorld } from '@vtt/engine/samples';
import { viewsOf, load, reveal, QUICK } from './round-trip.tsx';
import type { View } from './round-trip.tsx';
import { shownText } from './no-keys.tsx';
import { useLocale } from '../store/locale.ts';

const RUSSIAN = /[А-Яа-яЁё]/u;
const WORD = /[А-Яа-яЁё]+/gu;

const latinLetter = (letter: string): string => {
  const out = latinOf(letter);
  return letter === letter.toLowerCase() ? out : out.charAt(0).toUpperCase() + out.slice(1);
};

const latinWord = (word: string): string => {
  const letters = [...word].map(latinLetter);
  return `${letters[0]}${latinOf(word[0]!)}${letters.slice(1).join('')}`;
};

const latinText = (text: string): string => text.replace(WORD, latinWord);

function latinData<T>(node: T): T {
  if (typeof node === 'string') return latinText(node) as T;
  if (Array.isArray(node)) return node.map(latinData) as T;
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, latinData(value)])) as T;
  return node;
}

export function englishWorld(world: SampleWorld): SampleWorld {
  const out = latinData(structuredClone(world));
  (out.system as { langs?: string[] }).langs = ['en'];
  return out;
}


const TRIM = /^[\s«»"'“”.,:;!?()…·•—–\-+/%№*→←↑↓]+|[\s«»"'“”.,:;!?(…·•—–\-+/%№*→←↑↓]+$/gu;

const NAMED = new Set(['label', 'name', 'title', 'plural', 'question', 'yes', 'no', 'hint', 'description', 'note', 'asLabel']);

function sampleWords(): Set<string> {
  const out = new Set<string>();
  const walk = (node: unknown, key?: string): void => {
    if (Array.isArray(node)) node.forEach(item => walk(item, key));
    else if (node && typeof node === 'object') Object.entries(node).forEach(([name, value]) => walk(value, name));
    else if (typeof node === 'string' && key && (NAMED.has(key) || key === 'said') && RUSSIAN.test(node)) {
      for (const part of node.split(/[A-Za-z0-9_@{}[\]<>=|#$^~`\\]+/u)) {
        const text = part.replace(/\s+/g, ' ').replace(TRIM, '');
        if (text) out.add(text);
      }
    }
  };
  walk(SAMPLE_WORLDS);
  walk(PIECES);
  return out;
}

let samples: Set<string> | null = null;

export function russianIn(pieces: readonly string[]): string[] {
  samples ??= sampleWords();
  const out = new Set<string>();
  for (const full of pieces) {
    const piece = full.split('\u0001')[0] ?? '';
    if (!RUSSIAN.test(piece)) continue;
    for (const part of piece.split(/[A-Za-z0-9_@{}[\]<>=|#$^~`\\]+/u)) {
      const text = part.replace(/\s+/g, ' ').replace(TRIM, '');
      if (RUSSIAN.test(text) && !samples.has(text)) out.add(text);
    }
  }
  return [...out];
}

const env = (): Record<string, string | undefined> => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

export interface LeftIo { read(): string[]; write(items: string[]): void }

const seen = new Map<string, Set<string>>();
const complete = new Map<string, boolean>();

export const note = (list: string, pieces: readonly string[]): void => {
  const set = seen.get(list) ?? new Set<string>();
  seen.set(list, set);
  for (const text of russianIn(pieces)) set.add(text);
};

export const quickOnly = (list: string, quick: boolean): void => {
  complete.set(list, (complete.get(list) ?? true) && quick);
};

export const wantedIn = (name: string, quick: boolean): boolean => {
  const mode = env().ENGLISH;
  return mode === 'full' || mode === name || quick;
};

export function english(name: string, list: string, part = 0, parts = 1): void {
  const world = SAMPLE_WORLDS.find(one => one.system.name === name);
  const wanted = wantedIn(name, QUICK.includes(name));
  const limit = Number(env().ROUND_TRIP_MS) || 600000;
  if (wanted && !QUICK.includes(name)) quickOnly(list, false);

  describe('при английском интерфейсе русского текста нет', () => {
    beforeEach(() => {
      try { localStorage.clear(); } catch { /* empty */ }
      useLocale.getState().setLang('en');
    });
    afterEach(() => { cleanup(); useLocale.getState().setLang('ru'); });

    describe.skipIf(!wanted || !world)(name, () => {
      const latin = world ? englishWorld(world) : null;
      const views: View[] = latin ? viewsOf(latin.system, latin.compendium).filter((_, index) => index % parts === part) : [];
      for (const view of views) {
        it(view.name, async () => {
          load(structuredClone(latin!), view.pick);
          render(view.ui());
          reveal();
          act(() => { document.querySelectorAll<HTMLElement>('.chips__text').forEach(input => fireEvent.blur(input)); });
          await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)); });
          note(list, shownText());
        }, limit);
      }
    });
  });
}

export function englishLeft(list: string, io: LeftIo): void {
  describe('список «осталось русским» только уменьшается', () => {
    it(list, () => {
      const now = [...(seen.get(list) ?? [])].sort();
      const before = io.read();
      const mode = env().ENGLISH;
      if (mode === 'write') {
        io.write(now);
        return;
      }
      const fresh = now.filter(text => !before.includes(text));
      expect(fresh, `новый русский текст при английском интерфейсе:\n${fresh.join('\n')}`).toEqual([]);
      if (mode === undefined && (complete.get(list) ?? true)) {
        const gone = before.filter(text => !now.includes(text));
        expect(gone, `этого русского текста на экране больше нет — уберите из i18n/left/${list}.json (ENGLISH=write):\n${gone.slice(0, 40).join('\n')}`).toEqual([]);
      }
    });
  });
}
