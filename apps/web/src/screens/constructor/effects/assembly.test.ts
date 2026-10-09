import { describe, it, expect, beforeEach } from 'vitest';
import { useWorld, emptySystem } from '../../../store/world.ts';
import { BRICKS, retype } from '../cards.ts';
import { newEffect, newCalled } from '../factory.ts';
import { trial, mannequin } from '@vtt/engine/events/trial';
import { lintSystem, errorsOf } from '@vtt/engine/model/lint';
import type { System, Sheet, Step } from '@vtt/schema';

const base = (): System => ({
  ...emptySystem(),
  tables: { лист: { shape: 'single', columns: [
    { key: 'хиты', label: 'Хиты', kind: 'number', default: 20 },
    { key: 'временные', label: 'Временные хиты', kind: 'number', default: 5, min: 0 },
    { key: 'броня', label: 'Броня', kind: 'number', default: 10 },
  ] } },
  constants: { к20: { label: 'Кость проверки', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
} as System);

const addSteps = (effectId: string, brick: string): Step[] => {
  const template = BRICKS.find(b => b.key === brick)!;
  let made: Step[] = [];
  useWorld.getState().editEffect(effectId, draft => {
    const taken = (draft.steps ?? []).map(s => s.id).filter(Boolean) as string[];
    made = template.make(useWorld.getState().system, taken);
    (draft.steps ??= []).push(...made);
  });
  return made;
};

const addStep = (effectId: string, brick: string): Step => addSteps(effectId, brick)[0]!;

const fill = (effectId: string, at: number, change: (step: Record<string, unknown>) => void) =>
  useWorld.getState().editEffect(effectId, draft => { change(draft.steps![at] as unknown as Record<string, unknown>); });

const newManual = (): string => {
  const made = newEffect(useWorld.getState().system, 'manual');
  useWorld.getState().editSystem(draft => { draft.effects[made.key] = made.value; });
  return made.key;
};

const played = (system: System, effectId: string, values: Record<string, number>, dice: 'min' | 'max') => {
  const to = { ...mannequin(system, 'б', 'Б'), values } as Sheet;
  return trial({ system, effectId, from: mannequin(system, 'а', 'А'), to, dice });
};

describe('собранное шагами конструктора работает в движке', () => {
  beforeEach(() => {
    useWorld.setState(state => ({ ...state, system: base(), activeEffectId: null }));
  });

  it('хвост «временные хиты → хиты»: перебор первого изменения уходит во второе', () => {
    const id = newManual();
    addStep(id, 'change');
    fill(id, 1, step => {
      step.id = 'временные_сняты';
      step.target = { expr: '@цель.временные' };
      step.direction = 'subtract';
      step.value = { expr: '8' };
    });
    addStep(id, 'change');
    fill(id, 2, step => {
      step.target = { expr: '@цель.хиты' };
      step.direction = 'subtract';
      step.value = { expr: '@временные_сняты.overkill' };
    });

    const system = useWorld.getState().system;
    expect(errorsOf(lintSystem(system))).toEqual([]);

    const out = played(system, id, { хиты: 20, временные: 5 }, 'max');
    const target = out.sheets.find(s => s.id === 'б')!;
    expect(target.values.временные).toBe(0);
    expect(target.values.хиты).toBe(17);
  });

  it('крит по «выпало 20 на костях»: условие блока «Если» — сравнение числа формулой', () => {
    const id = newManual();
    const [roll, check] = addSteps(id, 'check') as [Step, Step];
    fill(id, 1, step => {
      step.die = 'к20';
    });
    fill(id, 2, step => {
      step.versus = { expr: '@цель.броня' };
    });
    addSteps(id, 'branch');
    fill(id, 3, step => {
      step.if = { expr: `@${check.id}.natural >= 20` };
    });
    useWorld.getState().editEffect(id, draft => {
      const steps = draft.steps!;
      steps.splice(4, 0, BRICKS.find(b => b.key === 'change')!.make(useWorld.getState().system, [])[0]!);
    });
    fill(id, 4, step => {
      step.target = { expr: '@цель.хиты' };
      step.direction = 'subtract';
      step.value = { expr: '6' };
    });

    const system = useWorld.getState().system;
    expect(roll.type).toBe('roll');
    expect(errorsOf(lintSystem(system))).toEqual([]);
    expect(system.effects[id]!.steps!.map(step => step.type)).toEqual(['each', 'roll', 'check', 'branch', 'apply', 'end']);
    expect(system.effects[id]!.steps![3]!).toEqual({ type: 'branch', if: { expr: `@${check.id}.natural >= 20` } });

    expect(played(system, id, { хиты: 20, броня: 10 }, 'max').sheets.find(s => s.id === 'б')!.values.хиты).toBe(14);
    expect(played(system, id, { хиты: 20, броня: 1 }, 'min').sheets.find(s => s.id === 'б')!.values.хиты).toBe(20);
  });

  it('вызываемый эффект «Урон» принимает вызов и списывает хиты', () => {
    const made = newCalled(useWorld.getState().system);
    useWorld.getState().editSystem(draft => { draft.effects[made.key] = made.value; });

    const id = newManual();
    addStep(id, 'change');
    fill(id, 1, step => {
      retype(step, 'emit');
      step.effect = made.key;
      step.args = { лист: { expr: '@цель' }, amount: { expr: '7' } };
    });

    const system = useWorld.getState().system;
    expect(errorsOf(lintSystem(system))).toEqual([]);
    const out = played(system, id, { хиты: 20 }, 'max');
    expect(out.sheets.find(s => s.id === 'б')!.values.хиты).toBe(13);
    expect(out.lines.join(' ')).toContain('7');
  });
});
