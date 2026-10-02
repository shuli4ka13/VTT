// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import type { ReactElement } from 'react';
import { writeFileSync } from 'node:fs';
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';
import type { SampleWorld } from '@vtt/engine/model/systems';
import { recordKinds, sheetKinds } from '@vtt/engine/model/owned';
import { useWorld } from '../../store/world.ts';
import { world as W } from '@vtt/schema';
import { openAll } from '../../testing/render-open.tsx';
import { SheetTab } from './sheet-tab.tsx';
import { RulesTab } from './rules/rules-tab.tsx';
import { EffectsTab } from './effects/effects-tab.tsx';
import { RecordsTab } from './records-tab.tsx';
import { CompendiumScreen } from '../compendium/compendium.tsx';

type Key = string | number;
type World = { system: SampleWorld['system']; compendium: SampleWorld['compendium'] };
type View = { name: string; ui: () => ReactElement; pick: Record<string, unknown>; prepare?: () => void };
const MAPS = new Set(['effects', 'tables', 'constants', 'cells', 'args', 'values', 'view', 'roll_edits', 'tags', 'sheets', 'groups']);

const isExpr = (value: unknown): value is { expr: string } =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 1 && 'expr' in (value as object);

function leaves(node: unknown, path: Key[], out: [Key[], unknown][]): void {
  if (isExpr(node) || node === null || typeof node !== 'object') { out.push([path, node]); return; }
  if (Array.isArray(node)) {
    if (node.every(item => item === null || typeof item !== 'object')) { out.push([path, node]); return; }
    node.forEach((item, index) => leaves(item, [...path, index], out));
    return;
  }
  for (const [key, value] of Object.entries(node)) leaves(value, [...path, key], out);
}

const patternOf = (path: Key[]): string => path.map((key, at) => {
  if (typeof key === 'number') return '[]';
  const parent = path[at - 1];
  return typeof parent === 'string' && MAPS.has(parent) ? '*' : key;
}).join('.').replace(/\.\[\]/g, '[]');

const getAt = (root: unknown, path: Key[]): unknown => path.reduce<unknown>((at, key) => (at as Record<Key, unknown>)?.[key], root);

function blank(world: World, path: Key[]): World {
  const copy = structuredClone(world);
  const here = getAt(copy, path);
  if (Array.isArray(here) && here.length) { here.pop(); return copy; }
  const parent = getAt(copy, path.slice(0, -1)) as Record<Key, unknown>;
  const last = path[path.length - 1]!;
  if (Array.isArray(parent)) parent.splice(Number(last), 1);
  else delete parent[last];
  return copy;
}

const press = (text: string): void => {
  const found = [...document.querySelectorAll<HTMLElement>('button, [role="button"], .list__item')]
    .find(el => (el.textContent ?? '').replace(/\s+/g, ' ').trim().startsWith(text));
  if (found) act(() => { fireEvent.click(found); });
};

const SECTION: Record<string, string> = { constants: 'Кости', roll_edits: 'Правки броска', tags: 'Метки', initiative: 'Бой', toggles: 'Быстрые настройки' };

function viewsFor(world: World, path: Key[]): View[] {
  const [root, part, id, sub, at] = path.map(String);
  const rules = (section: string, pick: Record<string, unknown> = {}, then?: () => void): View => ({
    name: `Правила · ${section}`, ui: () => <RulesTab />, pick, prepare: () => { press(section); reveal(); then?.(); reveal(); },
  });
  const sheet = (pick: Record<string, unknown> = {}): View => ({ name: 'Лист', ui: () => <SheetTab />, pick });
  const kinds = sheetKinds(world.system).map(([key]) => sheet({ activeSheetKind: key }));
  if (root === 'compendium') {
    const record = world.compendium.records?.[Number(id)];
    return record ? [{ name: `запись ${record.id}`, ui: () => <CompendiumScreen />, pick: { activeRecordId: record.id } }] : [];
  }
  const effect = (key: string): View => ({
    name: `эффект ${key}`, ui: () => <EffectsTab />, pick: { activeEffectId: key },
    prepare: () => {
      const more = [...document.querySelectorAll<HTMLElement>('button')].find(el => (el.textContent ?? '').trim() === 'ещё');
      if (more) act(() => { fireEvent.click(more); });
      reveal();
    },
  });
  if (part === 'effects') return [effect(String(id))];
  if (part === 'grants') return (world.system.grants ?? []).map(key => effect(key));
  if (part === 'sheets' && id) return [sheet({ activeSheetKind: id })];
  if (part === 'tables' && id) {
    const table = world.system.tables?.[id];
    const book = recordKinds(world.system).some(([key]) => key === id);
    const column = sub === 'columns' ? table?.columns?.[Number(at)] : undefined;
    const label = column ? column.label || column.key : '';
    if (book) {
      return [{ name: `книга ${id}`, ui: () => <RecordsTab />, pick: { activeRecordKind: id }, prepare: () => { if (label) press(label); reveal(); } }];
    }
    if (table?.shape === 'single') {
      return [sheet(column ? { activeFieldTag: column.key } : {}), ...kinds, rules('Таблицы', { activeTableId: id })];
    }
    return [rules('Таблицы', { activeTableId: id }, () => { if (label) press(label); }), sheet(), ...kinds];
  }
  const section = SECTION[part ?? ''];
  return [
    ...(section ? [rules(section)] : []),
    ...Object.values(SECTION).filter(name => name !== section).map(name => rules(name)),
    sheet(), ...kinds,
  ];
}

const load = (world: World, pick: Record<string, unknown>): void => {
  useWorld.setState(state => ({
    ...state, system: structuredClone(world.system), compendium: structuredClone(world.compendium),
    activeFieldTag: null, activeGroupName: null, activeEffectId: null, activeRecordKind: null,
    activeSheetKind: null, activeStepIndex: null, activeTableId: null, activeRecordId: null,
    ...pick,
  }));
};

const reveal = (): void => {
  openAll();
  document.querySelectorAll('details').forEach(d => { d.open = true; });
};

const FIELDS = 'select, input, textarea';

const fields = (): Element[] => [...document.querySelectorAll(FIELDS)].filter(el => {
  const chips = el.closest('.chips');
  return !chips || chips.querySelector('input.chips__text') === el;
});

const shownOf = (el: Element): string => {
  const chips = el.closest('.chips');
  if (chips) return chips.getAttribute('data-value') ?? '';
  const input = el as HTMLInputElement;
  return input.type === 'checkbox' ? String(input.checked) : input.value;
};

const same = (a: unknown, b: unknown): boolean => {
  if (JSON.stringify(a) === JSON.stringify(b)) return true;
  try { expect(b).toEqual(a); return true; } catch { return false; }
};

const textsOf = (value: unknown): string[] => {
  if (isExpr(value)) return [value.expr, value.expr.replace(/^@/, '')];
  if (Array.isArray(value)) return value.length ? [String(value[value.length - 1])] : [];
  if (value === null || value === undefined) return [];
  return [String(value)];
};

function setTo(el: Element, texts: string[]): void {
  if (el instanceof HTMLSelectElement) {
    const option = [...el.options].find(o => texts.includes(o.value) || texts.includes((o.textContent ?? '').trim()));
    if (option) fireEvent.change(el, { target: { value: option.value } });
    return;
  }
  const input = el as HTMLInputElement;
  if (input.type === 'checkbox') { if (String(input.checked) !== texts[0]) fireEvent.click(input); return; }
  const text = texts[0] ?? '';
  const chips = input.closest('.chips');
  if (chips) {
    for (let i = 0; i < 30; i++) {
      const x = chips.querySelector('.chips__x');
      if (!x) break;
      fireEvent.mouseDown(x);
    }
    const inputs = [...chips.querySelectorAll<HTMLInputElement>('input.chips__text')];
    for (const other of inputs.slice(1)) fireEvent.change(other, { target: { value: '' } });
    const first = chips.querySelector<HTMLInputElement>('input.chips__text');
    if (!first) return;
    fireEvent.change(first, { target: { value: text } });
    fireEvent.keyDown(chips, { key: 'Enter' });
    return;
  }
  (input as unknown as { _valueTracker?: { setValue: (v: string) => void } })._valueTracker?.setValue(`${text}\u0000`);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.blur(input);
}

const mount = (world: World, view: View): boolean => {
  load(world, view.pick);
  try { render(view.ui()); } catch (err) {
    if (process.env.COVERAGE_DEBUG && process.env.COVERAGE_OUT) writeFileSync(`${process.env.COVERAGE_OUT}/debug.txt`, `  не рисуется ${view.name}: ${String(err).slice(0, 200)}\n`, { flag: 'a' });
    cleanup();
    return false;
  }
  reveal();
  view.prepare?.();
  return true;
};

let debugPath: Key[] = [];

function firstDiff(a: unknown, b: unknown, path = ''): string {
  if (JSON.stringify(a) === JSON.stringify(b)) return '';
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const found = firstDiff((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`);
      if (found) return found;
    }
    return '';
  }
  return `${path}: ${JSON.stringify(a)?.slice(0, 80)} → ${JSON.stringify(b)?.slice(0, 80)}`;
}

const squash = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);

function labelOf(el: Element): string {
  const pair = el.closest('.pair');
  if (pair?.querySelector('.call-args__name')) return `арг ${squash(pair.querySelector('.call-args__name')?.textContent)}`;
  const named = el.getAttribute('aria-label');
  if (named && !el.closest('.field')) return squash(named);
  const field = el.closest('.field');
  if (field) return squash(field.querySelector('.field__label')?.textContent).replace(/.заполнить$/u, '');
  let cell: Element | null = el;
  while (cell && !cell.parentElement?.classList.contains('sheet-grid')) cell = cell.parentElement;
  if (cell) {
    const kids = [...cell.parentElement!.children];
    const heads = kids.filter(k => k.classList.contains('sheet-grid__head'));
    const at = kids.indexOf(cell);
    if (heads.length) return `${squash(heads[at % heads.length]?.textContent)}#${Math.floor(at / heads.length)}`;
  }
  return squash(el.getAttribute('aria-label') ?? el.getAttribute('placeholder'));
}

function signatures(): string[] {
  const count = new Map<string, number>();
  return fields().map(el => {
    const head = squash(el.closest('.card')?.querySelector('.card__head, .step-fold, .step-fold__row')?.textContent).replace(/^[▾▸]\s*/, '');
    const card = /^(\d+) · /.exec(head)?.[1] ?? /^Подписка №\d+/.exec(head)?.[0] ?? head.slice(0, 12);
    const base = `${card}|${labelOf(el)}|${el.tagName}`;
    const n = (count.get(base) ?? 0) + 1;
    count.set(base, n);
    return `${base}|${n}`;
  });
}

let silent = true;

function restores(original: World, blanked: World, view: View, value: unknown): boolean {
  if (!mount(original, view)) return false;
  const was = new Map(signatures().map((sig, i) => [sig, shownOf(fields()[i]!)] as const));
  cleanup();
  if (!mount(blanked, view)) return false;
  const now = signatures();
  const shownNow = fields().map(shownOf);
  cleanup();
  const tries: [number, string[]][] = now.flatMap((sig, i) => {
    const before = was.get(sig);
    if (before !== undefined && before !== shownNow[i]) return [[i, [before]] as [number, string[]]];
    if (before === undefined && (shownNow[i] === '' || shownNow[i] === 'false')) return [[i, textsOf(value)] as [number, string[]]];
    return [];
  });
  if (tries.length) silent = false;
  if (Array.isArray(value) && value.length) {
    if (!mount(blanked, view)) return false;
    const wanted = String(value[value.length - 1]);
    fields().forEach((el, i) => {
      if (el instanceof HTMLSelectElement && [...el.options].some(o => o.value === wanted)) tries.push([i, [wanted]]);
    });
    cleanup();
  }
  if (process.env.COVERAGE_DEBUG && process.env.COVERAGE_OUT) {
    writeFileSync(`${process.env.COVERAGE_OUT}/debug.txt`, JSON.stringify({ view: view.name, tries: tries.slice(0, 10), sigs: tries.slice(0, 3).map(([i]) => now[i]), was: [...was.keys()].filter(k => /Какое|У кого/.test(k)) }) + '\n', { flag: 'a' });
  }
  for (const [index, texts] of tries.slice(0, 40)) {
    if (!mount(blanked, view)) return false;
    const done = new Set<string>();
    let target: Element | undefined = fields()[index];
    let wanted = texts;
    for (let round = 0; round < 4 && target; round++) {
      done.add(signatures()[fields().indexOf(target)] ?? '');
      try { setTo(target, wanted); } catch { break; }
      reveal();
      const { system, compendium } = useWorld.getState();
      if (same(original, { system, compendium })) { cleanup(); return true; }
      const sigs = signatures();
      const list = fields();
      const next = sigs.findIndex((sig, i) => !done.has(sig) && was.has(sig) && was.get(sig) !== shownOf(list[i]!));
      if (next < 0) break;
      target = list[next];
      wanted = [was.get(sigs[next]!)!];
    }
    if (process.env.COVERAGE_DEBUG && process.env.COVERAGE_OUT) {
      const { system, compendium } = useWorld.getState();
      writeFileSync(`${process.env.COVERAGE_OUT}/debug.txt`, `  try ${index} ${JSON.stringify(texts)} → ${JSON.stringify(getAt({ system, compendium }, debugPath))?.slice(0, 300)}\n    первое различие: ${firstDiff(original, { system, compendium })} · same=${same(original, { system, compendium })} · ${JSON.stringify(getAt(original, debugPath)).slice(0, 200)} / ${JSON.stringify(getAt({ system, compendium }, debugPath)).slice(0, 200)}\n`, { flag: 'a' });
    }
    cleanup();
  }
  return false;
}

const CREATED: [RegExp, string][] = [
  [/\.modifiers\[\]\.kind$/, '«+ правка поля» или «+ правка вызова»'],
  [/^system\.constants\.\*\.kind$/, '«+ кость» в «Правилах»'],
  [/^system\.tables\.\*\.(shape|key|owner)$/, 'вид таблицы выбирается при создании'],
  [/\.steps\[\]\.(of|as)$/, '«+ для каждой цели»'],
];

const SKIP = [/^sheets\b/, /\.id$/, /^system\.(id|name|title)$/, /\.type$/, /^title$/];

describe('опись путей пресетов: каждое значение ставится полем конструктора', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView ??= () => undefined;
    try { localStorage.clear(); } catch { return; }
  });
  afterEach(() => { cleanup(); });

  const only = process.env.COVERAGE_ONLY;
  const chosen = process.env.COVERAGE === 'full' ? SAMPLE_WORLDS.filter(world => !only || world.system.id === only) : [];
  const seen = new Set<string>();

  for (const sample of chosen) {
    it(`${sample.system.name}`, () => {
      const world: World = { system: structuredClone(sample.system), compendium: structuredClone(sample.compendium) };
      const all: [Key[], unknown][] = [];
      leaves(world, [], all);
      const report: string[] = [];
      for (const [path, value] of all) {
        const pattern = patternOf(path);
        if (seen.has(pattern) || SKIP.some(rule => rule.test(pattern))) continue;
        seen.add(pattern);
        const blanked = blank(world, path);
        debugPath = path.slice(0, -1);
        if (process.env.COVERAGE_DEBUG && !pattern.includes(process.env.COVERAGE_DEBUG)) continue;
        const required = path[0] === 'system' && !W.system.safeParse(blanked.system).success;
        const created = CREATED.find(([rule]) => rule.test(pattern));
        silent = true;
        const ok = !required && !created && viewsFor(world, path).some(view => restores(world, blanked, view, value));
        const verdict = required || created ? 'кнопкой' : ok ? 'есть' : silent ? 'умолч' : 'НЕТ ';
        report.push(`${verdict}  ${pattern}  ← ${path.join('.')} = ${JSON.stringify(value).slice(0, 60)}${created ? `  (${created[1]})` : ''}`);
      }
      if (process.env.COVERAGE_OUT) writeFileSync(`${process.env.COVERAGE_OUT}/${sample.system.id}.txt`, report.join('\n'));
      expect(report.length).toBeGreaterThan(0);
    }, 3_600_000);
  }

  it('без COVERAGE=full опись не гоняется — она долгая', () => {
    expect(chosen.length <= SAMPLE_WORLDS.length).toBe(true);
  });
});
