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
  const steps = stepsIn([effect.steps, effect.cost, effect.on, effect.attach, effect.detach]);
  const earlier = steps.map(s => ({ id: String(s.id), type: String(s.type) }));
  return steps.flatMap((step, i) => {
    const next = steps[i + 1];
    const glued = step.type === 'roll' && step.by && step.die && next?.type === 'check' && next.value?.expr === `@${step.id}`;
    return glued ? [{ id, effect, earlier, roll: step, check: next! }] : [];
  });
});

const lean = (roll: Loose, check: Loose) => ({
  roll: { die: roll.die, ...(roll.count ? { count: roll.count } : {}), ...(roll.bonus ? { bonus: roll.bonus } : {}), tags: roll.tags ?? [] },
  successWhen: check.successWhen ?? 'atLeast',
  versus: check.versus,
});

const parsedLean = (parsed: Loose) => ({
  ...parsed,
  roll: { die: parsed.roll.die, ...(parsed.roll.count ? { count: parsed.roll.count } : {}), ...(parsed.roll.bonus ? { bonus: parsed.roll.bonus } : {}), tags: parsed.roll.tags },
});

describe('проверка одной формулой', () => {
  it('каждая проверка образцов переживает «в текст и обратно» без потерь', () => {
    let seen = 0;
    for (const system of SAMPLE_SYSTEMS) {
      for (const { id, effect, earlier, roll, check } of checksOf(system)) {
        const text = formatCheck(roll, check);
        const parsed = parseCheck(text, system, name => refForName({ system, effect: effect as Effect, earlier }, name));
        expect('error' in parsed ? parsed.error : null, `${id}: ${text}`).toBeNull();
        expect(parsedLean(parsed as Loose), `${id}: ${text}`).toEqual(lean(roll, check));
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(10);
  });

  const system = {
    constants: { lead: { label: 'Ведущая', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
    tables: { лист: { shape: 'single', columns: [{ tag: 'ac', label: 'КД' }] }, rolls: { label: 'Броски', key: 'word', rows: [{ value: 'атака' }, { value: 'ловкость' }] } },
    effects: {},
  } as unknown as System;

  it('атака: кость, метки, прибавка и поле цели', () => {
    expect(parseCheck('кинуть(@lead, @атака, @ловкость) + 2 >= @цель.ac', system)).toEqual({
      roll: { die: { constant: 'lead' }, bonus: { expr: '2' }, tags: ['атака', 'ловкость'] },
      successWhen: 'atLeast',
      versus: { expr: '@цель.ac' },
    });
  });

  it('кость числом находится среди костей системы, а кость чужого листа — не кость системы', () => {
    expect(parseCheck('кинуть(1к20) <= 10', system)).toMatchObject({ roll: { die: { constant: 'lead' } }, successWhen: 'notOver' });
    expect(parseCheck('кинуть(@цель.lead) >= 12', system)).toHaveProperty('error');
    expect(parseCheck('кинуть(2к6) >= 7', system)).toHaveProperty('error');
  });

  it('встречный бросок справа — ошибка: защита — отдельный шаг «бросок» того, кто защищается', () => {
    const parsed = parseCheck('кинуть(@lead) > кинуть(@цель.lead, @атака) + 1', system);
    expect(parsed).toHaveProperty('error');
    expect((parsed as { error: string }).error).toMatch(/встречный бросок/);
    expect(parseCheck('кинуть(@lead) > @защита + 1', system)).toMatchObject({ successWhen: 'over', versus: { expr: '@защита + 1' } });
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
      roll: { tags: ['атака', { expr: '@чем' }] },
    });
    expect(formatCheck({ die: { constant: 'lead' }, tags: ['атака', { expr: '@чем' }] }, { versus: { expr: '10' } }))
      .toBe('кинуть(@lead, @атака, @чем) >= 10');
  });
});
