import { describe, it, expect } from 'vitest';
import { SAMPLE_SYSTEMS } from '@vtt/engine/model/systems';
import { compile, printFormula } from '@vtt/engine/formula';
import { parseRollFormula, parseCheckFormula, formatRollFormula, formatCheckFormula, compare } from './roll-formula.ts';
import type { System } from '@vtt/schema';

type Loose = Record<string, any>;

function stepsIn(node: unknown, out: Loose[] = []): Loose[] {
  if (Array.isArray(node)) for (const item of node) stepsIn(item, out);
  else if (node && typeof node === 'object') {
    const n = node as Loose;
    if (typeof n.type === 'string') out.push(n);
    for (const value of Object.values(n)) if (value && typeof value === 'object') stepsIn(value, out);
  }
  return out;
}

const norm = (ref: unknown): string | undefined => {
  const text = ref && typeof ref === 'object' ? String((ref as Loose).expr ?? '') : undefined;
  return text ? printFormula(compile(text).ast) : undefined;
};

const lean = (roll: Loose) => ({ die: roll.die, count: norm(roll.count), bonus: norm(roll.bonus) });

describe('бросок и проверка одной грамматикой кинуть(кость, сколько) + прибавка', () => {
  it('каждый бросок листа в образцах переживает «в текст и обратно»', () => {
    let seen = 0;
    for (const system of SAMPLE_SYSTEMS) {
      for (const step of stepsIn(Object.values(system.effects ?? {})).filter(s => s.type === 'roll' && s.by && s.die)) {
        const text = formatRollFormula(step);
        const parsed = parseRollFormula(text, system);
        expect('error' in parsed ? parsed.error : null, text).toBeNull();
        expect(lean(parsed as Loose), text).toEqual(lean(step));
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('каждая проверка-пара в образцах переживает «в текст и обратно»', () => {
    let seen = 0;
    for (const system of SAMPLE_SYSTEMS) {
      const steps = stepsIn(Object.values(system.effects ?? {}));
      steps.forEach((step, i) => {
        const next = steps[i + 1];
        if (!(step.type === 'roll' && step.by && step.die && next?.type === 'check' && next.value?.expr === `@${step.id}`)) return;
        const text = formatCheckFormula(step, next);
        const parsed = parseCheckFormula(text, system);
        expect('error' in parsed ? parsed.error : null, text).toBeNull();
        const got = parsed as Loose;
        expect({ ...lean(got.roll), op: got.successWhen, versus: norm(got.versus) }, text)
          .toEqual({ ...lean(step), op: next.successWhen ?? 'atLeast', versus: norm(next.versus) });
        seen++;
      });
    }
    expect(seen).toBeGreaterThanOrEqual(8);
  });

  const system = {
    constants: {
      lead: { label: 'Ведущая', kind: 'die', dice: [{ count: 1, sides: 20 }] },
      pool: { label: 'Набор', kind: 'die', dice: [{ count: 1, sides: 6 }], read: 'count' },
    },
    tables: {},
    effects: {},
  } as unknown as System;

  it('сколько костей — вторым числом, как в расчёте; «3» больше не принимают за метку', () => {
    expect(parseRollFormula('кинуть(@pool, @attack_pool + 2)', system)).toEqual({ die: 'pool', count: { expr: '@attack_pool + 2' }, bonus: null });
    expect(parseRollFormula('кинуть(@lead, 3)', system)).toEqual({ die: 'lead', count: { expr: '3' }, bonus: null });
    expect(formatRollFormula({ die: 'pool', count: { expr: '@attack_pool' } })).toBe('кинуть(@pool, @attack_pool)');
  });

  it('кость записью находится среди костей системы, кавычки можно не ставить', () => {
    expect(parseRollFormula('кинуть(1к20) + 2', system)).toEqual({ die: 'lead', bonus: { expr: '2' } });
    expect(parseRollFormula('кинуть("1к20") - @штраф', system)).toEqual({ die: 'lead', bonus: { expr: '-@штраф' } });
    expect(parseRollFormula('кинуть(2к6)', system)).toHaveProperty('error');
    expect(parseRollFormula('кинуть(@нет)', system)).toHaveProperty('error');
  });

  it('третье число («оставить») — только в расчёте; сравнение — только в проверке', () => {
    expect(parseRollFormula('кинуть(@lead, 2, 1)', system)).toHaveProperty('error');
    expect(parseRollFormula('кинуть(@lead) >= 10', system)).toHaveProperty('error');
  });

  it('проверка: сравнение, встречный бросок справа — ошибка словами', () => {
    expect(parseCheckFormula('кинуть(@lead) + 2 >= @цель.ac', system)).toEqual({ roll: { die: 'lead', bonus: { expr: '2' } }, successWhen: 'atLeast', versus: { expr: '@цель.ac' } });
    expect(parseCheckFormula('кинуть(@lead) + 2', system)).toHaveProperty('error');
    expect((parseCheckFormula('кинуть(@lead) > кинуть(@lead)', system) as { error: string }).error).toMatch(/встречный бросок/);
  });

  it('сравнение не смотрит внутрь кавычек', () => {
    expect(compare('если(@x == "a > b", 1, 0) >= 1')).toEqual({ left: 'если(@x == "a > b", 1, 0)', op: 'atLeast', right: '1' });
  });
});
