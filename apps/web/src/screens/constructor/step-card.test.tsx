import { describe, it, expect } from 'vitest';
import { problemOf, slotsOf } from './step-card.tsx';
import { registry } from '@vtt/engine/engine/steps/index';
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

describe('формула зовёт шаг выше', () => {
  const system = {
    fields: [{ tag: 'hp', label: 'Текущие ХП', value: { kind: 'stored', type: 'number', default: 20 } }],
    effects: {},
  } as unknown as System;
  const effect = { params: [] } as unknown as Effect;
  const apply = {
    type: 'apply', target: { tag: 'hp' }, direction: 'set',
    value: { expr: '#hp - #n', of: 'target' },
  } as unknown as Step;

  it('имя шага выше — не «поля нет»', () => {
    expect(problemOf(apply, system, effect, [{ id: 'n', type: 'amount' }])).toBeNull();
  });

  it('а вот незнакомое имя по-прежнему беда', () => {
    const problem = problemOf(apply, system, effect, []);
    expect(problem?.missingField).toBe('n');
  });
});

describe('описание слотов живёт в движке, а не в копии конструктора', () => {
  it('у каждого типа шага из реестра есть слоты с человеческими подписями', () => {
    expect(registry.size).toBeGreaterThan(0);
    for (const [type] of registry) {
      const slots = slotsOf(type) ?? [];
      expect(slots.length, type).toBeGreaterThan(0);
      for (const slot of slots) expect(slot.label, `${type}.${slot.key}`).toMatch(/[а-яё]/i);
    }
  });

  it('обязательный слот описан движком: пустая мишень применения — приговор', () => {
    const step = { type: 'apply', direction: 'subtract', value: { const: 1 } } as unknown as Step;
    expect(problemOf(step, systemWithDie(), blankEffect, [])?.text).toContain('не заполнено');
  });

  it('неизвестный тип шага — приговор называет тип', () => {
    expect(problemOf({ type: 'котик' } as unknown as Step, systemWithDie(), blankEffect, [])?.text)
      .toContain('котик');
  });
});
