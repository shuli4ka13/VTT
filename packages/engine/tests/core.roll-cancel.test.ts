import { describe, it, expect } from 'vitest';
import { newPass } from '../src/engine/calc.ts';
import { rollHeld, rollEdits } from '../src/core/edits.ts';
import { lintSystem } from '../src/model/lint.ts';
import type { System, Sheet } from '../src/model/types.ts';

const world = (edits: Record<string, unknown>): System => ({
  id: 'п', name: 'п', tags: {},
  tables: { лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 10 }] } },
  roll_edits: edits,
  effects: Object.fromEntries(Object.keys(edits).map(key => [key, {
    label: key, activation: 'passive',
    modifiers: [{ kind: 'edit', call: 'roll', param: 'edits', edit: key, if: { expr: '@бросающий == @носитель' } }],
  }])),
} as unknown as System);

const sheet = (id: string, effects: string[]): Sheet =>
  ({ id, systemId: 'п', name: id, values: {}, has: [], effects: effects.map(effectId => ({ effectId })) } as unknown as Sheet);

const words = (system: System, sheets: Sheet[], claims: string[] = []) => {
  const holders = sheets.map(one => ({ id: one.id, view: newPass(system, one, { compendium: { records: [] } }) }));
  const out = rollEdits(rollHeld(holders, sheets[0]!.id, null, []), claims, holders[0]!.view);
  return { words: out.words, canceled: out.canceled };
};

const one = (ops: unknown[] = [{ op: 'addDie' }]) => ({ ops });

describe('гашение правок броска', () => {
  it('одно слово гасит два: «Помеха» снимает и «Преимущество», и «Вдохновение»', () => {
    const system = world({
      преимущество: one(), вдохновение: one(),
      помеха: { ...one(), cancels: ['преимущество', 'вдохновение'] },
    });
    const out = words(system, [sheet('я', ['преимущество', 'вдохновение', 'помеха'])]);
    expect(out.words).toEqual([]);
    expect(out.canceled.sort()).toEqual(['вдохновение', 'помеха', 'преимущество']);
  });

  it('связь взаимная: записана у одного слова — гасит в обе стороны', () => {
    const system = world({ преимущество: { ...one(), cancels: ['помеха'] }, помеха: one() });
    expect(words(system, [sheet('я', ['помеха', 'преимущество'])]).words).toEqual([]);
  });

  it('без «каждый источник считается» два источника — одно слово, и гасят целиком', () => {
    const system = world({ благо: { ...one(), cancels: ['беда'] }, беда: { ...one(), cancels: ['благо'] } });
    const out = words(system, [sheet('я', ['благо', 'беда'])], ['благо']);
    expect(out.words).toEqual([]);
  });

  it('по одному: два источника блага против одной беды — остаётся одно благо', () => {
    const system = world({
      благо: { ...one(), stacks: true, cancels: ['беда'] },
      беда: { ...one(), stacks: true, cancels: ['благо'] },
    });
    const out = words(system, [sheet('я', ['благо', 'беда'])], ['благо']);
    expect(out.words).toEqual(['благо']);
    expect(out.canceled.sort()).toEqual(['беда', 'благо']);
  });

  it('по одному: источник считается по листу — одно и то же слово с двух листов даёт два', () => {
    const system = world({ благо: { ...one(), stacks: true } }) as System;
    (system.effects!.благо as { modifiers: { if?: unknown }[] }).modifiers[0]!.if = undefined;
    const out = words(system, [sheet('я', ['благо']), sheet('друг', ['благо'])]);
    expect(out.words).toEqual(['благо', 'благо']);
  });

  it('третий источник меняет набор слов — окно «увидев кости» это заметит', () => {
    const system = world({ благо: { ...one(), stacks: true } }) as System;
    (system.effects!.благо as { modifiers: { if?: unknown }[] }).modifiers[0]!.if = undefined;
    const two = words(system, [sheet('я', ['благо']), sheet('друг', [])], ['благо']);
    const three = words(system, [sheet('я', ['благо']), sheet('друг', ['благо'])], ['благо']);
    expect(two.words.length).toBe(2);
    expect(three.words.length).toBe(3);
  });

  it('линт: гасит само себя, гасит пустоту, связь в одну сторону', () => {
    const texts = lintSystem(world({
      а: { ...one(), cancels: ['а'] }, б: { ...one(), cancels: ['нет'] }, в: { ...one(), cancels: ['г'] }, г: one(),
    })).map(p => p.text);
    expect(texts.some(t => t.includes('гасит сама себя'))).toBe(true);
    expect(texts.some(t => t.includes('гасит слово «нет»'))).toBe(true);
    expect(texts.some(t => t.includes('встречной связи нет'))).toBe(true);
  });
});
