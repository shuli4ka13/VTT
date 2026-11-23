import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import type { SampleWorld } from '@vtt/engine/samples';
import { viewsOf, load, reveal, QUICK } from './round-trip.tsx';
import type { View } from './round-trip.tsx';

type Json = Record<string, any>;

const LATIN = /^[A-Za-z][A-Za-z0-9_]*$/;
const LABEL_FIELDS = new Set(['label', 'name', 'title', 'plural', 'said']);
const INTERFACE_WORDS = new Set(['name', 'type', 'text', 'list', 'none', 'level', 'value', 'tags', 'time', 'turn', 'save', 'help']);

function stepKeys(steps: unknown, out: Set<string>): void {
  if (!Array.isArray(steps)) return;
  for (const step of steps as Json[]) {
    if (typeof step?.id === 'string') out.add(step.id);
    if (typeof step?.as === 'string') out.add(step.as);
    for (const tag of Array.isArray(step?.tags) ? step.tags : []) if (typeof tag === 'string') out.add(tag);
  }
}

export function keysOfSystem(system: Json): string[] {
  const out = new Set<string>();
  for (const [key, table] of Object.entries(system.tables ?? {}) as [string, Json][]) {
    out.add(key);
    for (const column of table.columns ?? []) {
      out.add(column.key);
      for (const stage of column.stages ?? []) out.add(stage.key);
    }
    for (const row of table.rows ?? []) {
      if (typeof row.value === 'string' && row.value) out.add(row.value.replace(/ /g, '_'));
      for (const cell of Object.keys(row.cells ?? {})) out.add(cell);
    }
  }
  for (const [key, effect] of Object.entries(system.effects ?? {}) as [string, Json][]) {
    out.add(key);
    if (effect.group) out.add(String(effect.group).replace(/ /g, '_'));
    for (const param of effect.params ?? []) {
      out.add(param.key);
      for (const stage of param.stages ?? []) out.add(stage.key);
    }
    for (const column of effect.returns ?? []) out.add(column.key);
    for (const tag of effect.tags ?? []) out.add(String(tag).replace(/ /g, '_'));
    for (const list of ['steps', 'cost']) stepKeys(effect[list], out);
    for (const handler of effect.on ?? []) for (const list of ['steps', 'cost']) stepKeys(handler[list], out);
  }
  for (const name of ['tags', 'rolls', 'roll_edits', 'sheets', 'groups', 'constants']) {
    for (const key of Object.keys(system[name] ?? {})) out.add(key.replace(/ /g, '_'));
  }
  for (const constant of Object.values(system.constants ?? {}) as Json[]) {
    for (const part of constant?.dice ?? []) if (typeof part?.name === 'string') out.add(part.name);
  }
  for (const block of system.blocks ?? []) out.add(String(block.key).replace(/ /g, '_'));
  for (const page of system.pages ?? []) out.add(String(page.key).replace(/ /g, '_'));
  return [...out];
}

function humanWords(world: unknown): Set<string> {
  const words = new Set<string>();
  const walk = (node: unknown, key?: string): void => {
    if (Array.isArray(node)) node.forEach(item => walk(item, key));
    else if (node && typeof node === 'object') Object.entries(node).forEach(([name, value]) => walk(value, name));
    else if (typeof node === 'string' && key && LABEL_FIELDS.has(key)) {
      for (const word of node.toLowerCase().match(/[a-z0-9_]+/g) ?? []) words.add(word);
    }
  };
  walk(world);
  return words;
}

export function forbiddenKeys(world: SampleWorld): string[] {
  const human = humanWords({ system: world.system, compendium: world.compendium });
  return keysOfSystem(world.system as unknown as Json)
    .filter(key => LATIN.test(key) && key.length >= 4)
    .filter(key => !human.has(key.toLowerCase()) && !INTERFACE_WORDS.has(key.toLowerCase()));
}

const ENGINE_TEXTS: RegExp[] = [
  /@srok/gu,
  /колонки «[^»]*» нет/gu,
];

const AUTHORED_TEXT = /^@?[A-Za-z][A-Za-z0-9_]*$/u;

const SHOWN_ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];

const where = (el: Element): string => {
  const chain: string[] = [];
  for (let node: Element | null = el; node && chain.length < 3 && node !== document.body; node = node.parentElement) {
    chain.push(`${node.tagName.toLowerCase()}${node.className && typeof node.className === 'string' ? `.${node.className.split(' ')[0]}` : ''}`);
  }
  return chain.join('<');
};

export function shownText(root: ParentNode = document.body): string[] {
  const pieces: string[] = [];
  const body = root as HTMLElement;
  const leafText = (el: Element): void => {
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent?.trim()) pieces.push(`${node.textContent}\u0001${where(el)}`);
    }
  };
  leafText(body);
  root.querySelectorAll<HTMLElement>('*').forEach(el => {
    leafText(el);
    for (const attr of SHOWN_ATTRS) {
      const value = el.getAttribute(attr);
      if (value) pieces.push(`${value}\u0001${where(el)}[${attr}]`);
    }
    if (el instanceof HTMLSelectElement) pieces.push(`${el.selectedOptions[0]?.textContent ?? ''}\u0001${where(el)}[select]`);
    else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.type !== 'hidden' && el.type !== 'checkbox' && el.type !== 'radio' && el.value) pieces.push(`${el.value}\u0001${where(el)}[value]`);
    }
  });
  return pieces;
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function leaks(pieces: string[], keys: string[]): string[] {
  if (!keys.length) return [];
  const regex = new RegExp(`(?<![\\p{L}\\p{N}_])(${keys.map(escape).join('|')})(?![\\p{L}\\p{N}_])`, 'gu');
  const found = new Map<string, string>();
  for (const full of pieces) {
    const [piece = '', site = ''] = full.split('\u0001');
    if (site.startsWith('input.input<') && AUTHORED_TEXT.test(piece)) continue;
    const cleaned = ENGINE_TEXTS.reduce((text, pattern) => text.replace(pattern, ' '), piece);
    for (const match of cleaned.matchAll(regex)) {
      if (found.has(match[1]!)) continue;
      const at = match.index ?? 0;
      found.set(match[1]!, `${cleaned.slice(Math.max(0, at - 30), at + match[1]!.length + 30).replace(/\s+/g, ' ')}» ← ${site}`);
    }
  }
  return [...found].map(([key, around]) => `«${key}» в «${around}`);
}

const env = (): Record<string, string | undefined> => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

export function noKeys(name: string, part = 0, parts = 1): void {
  const world = SAMPLE_WORLDS.find(one => one.system.name === name);
  const mode = env().NO_KEYS;
  const wanted = mode === 'full' || mode === name || QUICK.includes(name);
  const limit = Number(env().ROUND_TRIP_MS) || 600000;

  describe('экран не показывает ключ', () => {
    beforeEach(() => { try { localStorage.clear(); } catch { return; } });
    afterEach(() => { cleanup(); });

    describe.skipIf(!wanted || !world)(name, () => {
      const keys = world ? forbiddenKeys(world) : [];
      const views: View[] = world ? viewsOf(world.system, world.compendium).filter((_, index) => index % parts === part) : [];
      for (const view of views) {
        it(view.name, async () => {
          load(structuredClone(world!), view.pick);
          render(view.ui());
          reveal();
          act(() => { document.querySelectorAll<HTMLElement>('.chips__text').forEach(input => fireEvent.blur(input)); });
          await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)); });
          expect(leaks(shownText(), keys)).toEqual([]);
        }, limit);
      }
    });
  });
}
