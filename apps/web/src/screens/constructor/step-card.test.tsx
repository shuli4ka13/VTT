import { describe, it, expect } from 'vitest';
import { problemOf, slotsOf } from './step-card.tsx';
import { registry } from '@vtt/engine';
import { emptySystem } from '../../store/world.ts';
import type { Effect, Step, System } from '@vtt/schema';

const systemWithDie = (): System => ({
  ...emptySystem(),
  constants: { d20: { label: 'd20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
});

const blankEffect: Effect = { label: 'Тест', activation: 'manual', params: [], steps: [] };

const withActor: Effect = {
  label: 'Тест', activation: 'manual',
  params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }],
  steps: [],
} as unknown as Effect;

describe('problemOf: имя внутри формулы слота', () => {
  const roll = (bonus: string) => ({
    type: 'roll', die: 'd20', bonus: { expr: bonus }, by: { expr: '@действующий' },
  }) as unknown as Step;

  it('ловит несуществующее поле листа в формуле прибавки броска', () => {
    const problem = problemOf(roll('@действующий.нет_такого'), systemWithDie(), withActor, []);
    expect(problem?.missingField).toBe('нет_такого');
    expect(problem?.text).toContain('нет_такого');
  });

  it('поле, объявленное в системе и названное через лист, формулу не ломает', () => {
    const system: System = { ...systemWithDie(), tables: { лист: { shape: 'single', columns: [{ key: 'attack_bonus', label: 'Бонус атаки', kind: 'number' }] } } };
    expect(problemOf(roll('@действующий.attack_bonus'), system, withActor, [])).toBeNull();
  });

  it('поле без листа — приговор: чьё это поле', () => {
    const system: System = { ...systemWithDie(), tables: { лист: { shape: 'single', columns: [{ key: 'attack_bonus', label: 'Бонус атаки', kind: 'number' }] } } };
    const problem = problemOf(roll('@attack_bonus'), system, withActor, []);
    expect(problem?.missingField).toBe('attack_bonus');
    expect(problem?.text).toContain('чьё поле');
  });

  it('сохранённая формула, которая не разбирается, — приговор шага', () => {
    expect(problemOf(roll('@нез +'), systemWithDie(), withActor, [])?.text).toMatch(/не разбирается/);
  });
});

describe('формула зовёт шаг выше', () => {
  const system = {
    tables: { лист: { shape: 'single', columns: [{ key: 'hp', label: 'Текущие ХП', kind: 'number', default: 20 }] } },
    effects: {},
  } as unknown as System;
  const effect = { params: [{ key: 'цель', label: 'Цель', kind: 'sheet' }] } as unknown as Effect;
  const apply = {
    type: 'apply', target: { expr: '@цель.hp' }, direction: 'set',
    value: { expr: '@цель.hp - @n' },
  } as unknown as Step;

  it('имя шага выше — не «поля нет»', () => {
    expect(problemOf(apply, system, effect, [{ id: 'n', type: 'roll' }])).toBeNull();
  });

  it('а вот незнакомое имя по-прежнему беда', () => {
    const problem = problemOf(apply, system, effect, []);
    expect(problem?.missingField).toBe('n');
  });
});

describe('описание слотов живёт в движке, а не в копии конструктора', () => {
  it('у каждого типа шага из реестра есть слоты с человеческими подписями', () => {
    expect(registry.size).toBeGreaterThan(0);
    for (const [type, mod] of registry) {
      const slots = slotsOf(type) ?? [];
      if (mod.splits || type === 'end') {
        expect(mod.label, type).toMatch(/[а-яё]/i);
        continue;
      }
      expect(slots.length, type).toBeGreaterThan(0);
      for (const slot of slots) expect(slot.label, `${type}.${slot.key}`).toMatch(/[а-яё]/i);
    }
  });

  it('обязательный слот описан движком: пустая мишень применения — приговор', () => {
    const step = { type: 'apply', direction: 'subtract', value: { expr: '1' } } as unknown as Step;
    expect(problemOf(step, systemWithDie(), blankEffect, [])?.text).toContain('не заполнено');
  });

  it('неизвестный тип шага — приговор называет тип', () => {
    expect(problemOf({ type: 'котик' } as unknown as Step, systemWithDie(), blankEffect, [])?.text)
      .toContain('котик');
  });
});
