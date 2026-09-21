import { describe, it, expect, beforeEach } from 'vitest';
import { useWorld, emptySystem } from '../../../store/world.ts';
import { BRICKS } from '../cards.ts';
import { newEffect, newCalled } from '../factory.ts';
import { trial, mannequin } from '@vtt/engine/events/trial';
import { lintSystem, errorsOf } from '@vtt/engine/model/lint';
import type { System, Sheet, Step } from '@vtt/schema';

const base = (): System => ({
  ...emptySystem(),
  fields: [
    { tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } },
    { tag: 'временные', label: 'Временные хиты', value: { kind: 'stored', type: 'number', default: 5, min: 0 } },
    { tag: 'броня', label: 'Броня', value: { kind: 'stored', type: 'number', default: 10 } },
  ],
  constants: { к20: { label: 'Кость проверки', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
} as System);

const addStep = (effectId: string, brick: string): Step => {
  const template = BRICKS.find(b => b.key === brick)!;
  let made: Step | undefined;
  useWorld.getState().editEffect(effectId, draft => {
    const taken = (draft.steps ?? []).map(s => s.id).filter(Boolean) as string[];
    made = template.make(useWorld.getState().system, taken)[0]!;
    (draft.steps ??= []).push(made);
  });
  return made!;
};

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
    const first = addStep(id, 'change');
    fill(id, 0, step => {
      step.target = { tag: 'временные' };
      step.direction = 'subtract';
      step.value = { const: 8 };
    });
    addStep(id, 'change');
    fill(id, 1, step => {
      step.target = { tag: 'хиты' };
      step.direction = 'subtract';
      step.value = { ref: `${first.id}.overkill` };
    });

    const system = useWorld.getState().system;
    expect(errorsOf(lintSystem(system))).toEqual([]);

    const out = played(system, id, { хиты: 20, временные: 5 }, 'max');
    const target = out.sheets.find(s => s.id === 'б')!;
    expect(target.values.временные).toBe(0);
    expect(target.values.хиты).toBe(17);
  });

  it('крит по «выпало 20 на костях»: условие — не формула, а сравнение числа', () => {
    const id = newManual();
    const check = addStep(id, 'check');
    fill(id, 0, step => {
      (step.roll as Record<string, unknown>).die = { constant: 'к20' };
      step.versus = { tag: 'броня' };
    });
    addStep(id, 'change');
    fill(id, 1, step => {
      step.target = { tag: 'хиты' };
      step.direction = 'subtract';
      step.value = { const: 6 };
      step.when = { ref: `${check.id}.natural`, atLeast: 20 };
    });

    const system = useWorld.getState().system;
    expect(errorsOf(lintSystem(system))).toEqual([]);
    expect(JSON.stringify(system.effects[id]!.steps![1]!.when)).not.toContain('expr');

    expect(played(system, id, { хиты: 20, броня: 10 }, 'max').sheets.find(s => s.id === 'б')!.values.хиты).toBe(14);
    expect(played(system, id, { хиты: 20, броня: 1 }, 'min').sheets.find(s => s.id === 'б')!.values.хиты).toBe(20);
  });

  it('вызываемый эффект «Урон» принимает вызов и списывает хиты', () => {
    const made = newCalled(useWorld.getState().system);
    useWorld.getState().editSystem(draft => { draft.effects[made.key] = made.value; });

    const id = newManual();
    addStep(id, 'change');
    fill(id, 0, step => {
      step.type = 'emit';
      step.event = made.key;
      step.amount = { const: 7 };
      delete step.target;
      delete step.direction;
    });

    const system = useWorld.getState().system;
    expect(errorsOf(lintSystem(system))).toEqual([]);
    const out = played(system, id, { хиты: 20 }, 'max');
    expect(out.sheets.find(s => s.id === 'б')!.values.хиты).toBe(13);
    expect(out.lines.join(' ')).toContain('7');
  });
});
