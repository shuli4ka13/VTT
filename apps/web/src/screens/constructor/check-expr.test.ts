import { describe, it, expect } from 'vitest';
import { SAMPLE_SYSTEMS } from '@vtt/engine/model/systems';
import { parseCheck, formatCheck } from './check-expr.ts';
import { refForName } from './slots.tsx';
import type { Effect, System } from '@vtt/schema';

type Loose = Record<string, any>;

function stepsIn(node: unknown, out: Loose[] = []): Loose[] {
  if (Array.isArray(node)) for (const item of node) stepsIn(item, out);
  else if (node && typeof node === 'object') {
    const n = node as Loose;
    if (typeof n.type === 'string' && typeof n.id === 'string') out.push(n);
    for (const value of Object.values(n)) if (value && typeof value === 'object') stepsIn(value, out);
  }
  return out;
}

const checksOf = (system: System) => Object.entries(system.effects ?? {}).flatMap(([id, effect]) => {
  const steps = stepsIn([effect.steps, effect.self]);
  const earlier = steps.map(s => ({ id: String(s.id), type: String(s.type) }));
  return steps.filter(s => s.type === 'threshold').map(step => ({ id, effect, earlier, step }));
});

const lean = (step: Loose) => ({
  roll: { die: step.roll?.die, ...(step.roll?.count ? { count: step.roll.count } : {}), ...(step.roll?.bonus ? { bonus: step.roll.bonus } : {}), tags: step.roll?.tags ?? [] },
  ...(step.side === 'target' ? { side: 'target' } : {}),
  successWhen: step.successWhen ?? 'atLeast',
  versus: step.versus?.roll
    ? { roll: { die: step.versus.roll.die, ...(step.versus.roll.count ? { count: step.versus.roll.count } : {}), ...(step.versus.roll.bonus ? { bonus: step.versus.roll.bonus } : {}), ...(step.versus.roll.tags?.length ? { tags: step.versus.roll.tags } : {}) } }
    : step.versus,
});

const parsedLean = (parsed: Loose) => ({
  ...parsed,
  roll: { die: parsed.roll.die, ...(parsed.roll.count ? { count: parsed.roll.count } : {}), ...(parsed.roll.bonus ? { bonus: parsed.roll.bonus } : {}), tags: parsed.roll.tags },
});

describe('проверка одной формулой', () => {
  it('каждая проверка образцов переживает «в текст и обратно» без потерь', () => {
    let seen = 0;
    for (const system of SAMPLE_SYSTEMS) {
      for (const { id, effect, earlier, step } of checksOf(system)) {
        const text = formatCheck(step);
        const parsed = parseCheck(text, system, name => refForName({ system, effect: effect as Effect, earlier }, name));
        expect('error' in parsed ? parsed.error : null, `${id}: ${text}`).toBeNull();
        expect(parsedLean(parsed as Loose), `${id}: ${text}`).toEqual(lean(step));
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(10);
  });

  const system = {
    fields: [{ tag: 'ac', label: 'КД' }],
    constants: { lead: { label: 'Ведущая', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
    tables: { rolls: { label: 'Броски', key: 'word', rows: [{ value: 'атака' }, { value: 'ловкость' }] } },
    effects: {},
  } as unknown as System;

  it('атака: кость, метки, прибавка и поле получателя', () => {
    expect(parseCheck('кинуть(@lead, @атака, @ловкость) + 2 >= @получатель.ac', system)).toEqual({
      roll: { die: { constant: 'lead' }, bonus: { expr: '2' }, tags: ['атака', 'ловкость'] },
      successWhen: 'atLeast',
      versus: { expr: '@получатель.ac' },
    });
  });

  it('кость числом находится среди костей системы, бросает получатель по его префиксу', () => {
    expect(parseCheck('кинуть(1к20) <= 10', system)).toMatchObject({ roll: { die: { constant: 'lead' } }, successWhen: 'notOver' });
    expect(parseCheck('кинуть(@получатель.lead) >= 12', system)).toMatchObject({ side: 'target' });
    expect(parseCheck('кинуть(2к6) >= 7', system)).toHaveProperty('error');
  });

  it('встречный бросок справа', () => {
    expect(parseCheck('кинуть(@lead) > кинуть(@получатель.lead, @атака) + 1', system)).toMatchObject({
      successWhen: 'over',
      versus: { roll: { die: { constant: 'lead' }, bonus: { expr: '1' }, tags: ['атака'] } },
    });
  });

  it('без сравнения или без броска — понятная ошибка', () => {
    expect(parseCheck('кинуть(@lead) + 2', system)).toHaveProperty('error');
    expect(parseCheck('@lead >= 10', system)).toHaveProperty('error');
    expect(parseCheck('кинуть(@lead, @нет) >= 10', system)).toHaveProperty('error');
    expect(parseCheck('кинуть(@lead, 5) >= 10', system)).toHaveProperty('error');
  });

  it('метка может прийти входом', () => {
    const asName = (name: string) => (name === 'чем' ? ({ param: 'чем' } as never) : null);
    expect(parseCheck('кинуть(@lead, @атака, @чем) >= 10', system, asName)).toMatchObject({
      roll: { tags: ['атака', { param: 'чем' }] },
    });
    expect(formatCheck({ roll: { die: { constant: 'lead' }, tags: ['атака', { param: 'чем' }] }, versus: { expr: '10' } }))
      .toBe('кинуть(@lead, @атака, @чем) >= 10');
  });
});
