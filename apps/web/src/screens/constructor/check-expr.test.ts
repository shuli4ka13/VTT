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

const asExpr = (ref: Loose) => {
  if (ref && typeof ref === 'object' && 'ref' in ref && String(ref.ref).includes('.')) return { expr: `@${ref.ref}` };
  const field = /^@получатель\.([\p{L}\p{N}_]+)$/u.exec(String(ref?.expr ?? ''));
  return field ? { tag: field[1] } : ref;
};

const lean = (step: Loose) => ({
  roll: { die: step.roll?.die, ...(step.roll?.bonus ? { bonus: step.roll.bonus } : {}), check: step.roll?.check ?? null },
  ...(step.side === 'target' ? { side: 'target' } : {}),
  successWhen: step.successWhen ?? 'atLeast',
  versus: step.versus?.roll
    ? { roll: { die: step.versus.roll.die, ...(step.versus.roll.bonus ? { bonus: step.versus.roll.bonus } : {}), check: step.versus.roll.check ?? null } }
    : asExpr(step.versus),
});

const parsedLean = (parsed: Loose) => ({
  ...parsed,
  roll: { die: parsed.roll.die, ...(parsed.roll.bonus ? { bonus: parsed.roll.bonus } : {}), check: parsed.roll.check },
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
    rolls: [{ tag: 'attack_roll', label: 'Атака' }],
    effects: {},
  } as unknown as System;

  it('атака: кость, вид броска, прибавка и поле получателя', () => {
    expect(parseCheck('кинуть(@lead, @attack_roll) + 2 >= @получатель.ac', system)).toEqual({
      roll: { die: { constant: 'lead' }, bonus: { const: 2 }, check: 'attack_roll' },
      successWhen: 'atLeast',
      versus: { tag: 'ac' },
    });
  });

  it('кость числом находится среди костей системы, бросает получатель по его префиксу', () => {
    expect(parseCheck('кинуть(1к20) <= 10', system)).toMatchObject({ roll: { die: { constant: 'lead' } }, successWhen: 'notOver' });
    expect(parseCheck('кинуть(@получатель.lead) >= 12', system)).toMatchObject({ side: 'target' });
    expect(parseCheck('кинуть(2к6) >= 7', system)).toHaveProperty('error');
  });

  it('встречный бросок справа', () => {
    expect(parseCheck('кинуть(@lead) > кинуть(@получатель.lead, @attack_roll) + 1', system)).toMatchObject({
      successWhen: 'over',
      versus: { roll: { die: { constant: 'lead' }, bonus: { const: 1 }, check: 'attack_roll' } },
    });
  });

  it('без сравнения или без броска — понятная ошибка', () => {
    expect(parseCheck('кинуть(@lead) + 2', system)).toHaveProperty('error');
    expect(parseCheck('@lead >= 10', system)).toHaveProperty('error');
    expect(parseCheck('кинуть(@lead, @нет) >= 10', system)).toHaveProperty('error');
  });
});
