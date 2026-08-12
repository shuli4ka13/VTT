// apps/web/src/screens/constructor/step-card.test.tsx
//
// problemOf проверял ссылки вида {tag}, но не заглядывал внутрь формул
// ({expr:'#тег'}) — и составной слот (roll.bonus) их прячет глубже всего.
// Живой сценарий: скопировали донора «Атака» в пустую систему, взяли оба
// блока — экран говорит «эффект верный», хотя формула броска ссылается на
// поле, которого в системе нет. За столом это упадёт молча.
import { describe, it, expect } from 'vitest';
import { problemOf } from './step-card.tsx';
import { emptySystem } from '../../store/world.ts';
import type { Effect, Step, System } from '@vtt/schema';

const systemWithDie = (): System => ({
  ...emptySystem(),
  constants: { d20: { label: 'd20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
});

const blankEffect: Effect = { label: 'Тест', activation: 'manual', params: [], steps: [] };

describe('problemOf: тег внутри формулы слота', () => {
  it('ловит несуществующее поле в формуле составного слота (roll.bonus)', () => {
    const step = {
      type: 'threshold',
      roll: { die: { constant: 'd20' }, bonus: { expr: '#нет_такого' } },
      versus: { const: 10 },
    } as unknown as Step;

    const problem = problemOf(step, systemWithDie(), blankEffect, []);
    expect(problem?.missingField).toBe('нет_такого');
    expect(problem?.text).toContain('нет_такого');
  });

  it('поле, объявленное в системе, формулу не ломает', () => {
    const system: System = { ...systemWithDie(), fields: [{ tag: 'attack_bonus', label: 'Бонус атаки', group: 'Атака', value: { kind: 'stored', type: 'number', default: 0 } }] };
    const step = {
      type: 'threshold',
      roll: { die: { constant: 'd20' }, bonus: { expr: '#attack_bonus' } },
      versus: { const: 10 },
    } as unknown as Step;

    expect(problemOf(step, system, blankEffect, [])).toBeNull();
  });

  it('недописанная формула — не приговор этого места, молчит', () => {
    const step = {
      type: 'threshold',
      roll: { die: { constant: 'd20' }, bonus: { expr: '#нез +' } },
      versus: { const: 10 },
    } as unknown as Step;

    expect(problemOf(step, systemWithDie(), blankEffect, [])).toBeNull();
  });
});
