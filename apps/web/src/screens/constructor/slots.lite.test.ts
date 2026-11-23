import { describe, it, expect } from 'vitest';
import { LITE_WORLDS } from '@vtt/engine/samples';
import type { System } from '@vtt/schema';
import { fieldedOf, outputRefs } from './slots.tsx';

const rollOf = (systemId: string, effectId: string) => {
  const system = LITE_WORLDS.find(w => w.system.id === systemId)!.system as unknown as System;
  const effect = system.effects[effectId]!;
  const step = (effect.steps as unknown as Record<string, unknown>[]).find(one => one.type === 'roll' && one.field !== undefined)!;
  return { system, effect, step };
};

const refsOf = (systemId: string, effectId: string): string[] => {
  const { system, effect, step } = rollOf(systemId, effectId);
  const earlier = [{ id: String(step.id ?? 'brosok'), type: 'roll', ...fieldedOf(system, effect.params ?? [], step) }];
  return outputRefs(earlier as never).map(one => one.ref);
};

describe('итоги броска поля по правилам системы', () => {
  it('Fabula «атака»: адрес вычисленный, правила не дают успех и степени — плашек нет', () => {
    const refs = refsOf('fabula-ultima', 'attack');
    expect(refs).toContain('brosok.total');
    expect(refs).not.toContain('brosok.success');
    expect(refs).not.toContain('brosok.margin');
  });

  it('Warhammer «выстрел»: бросок поля с порогом даёт «пройден» и степени успеха', () => {
    const refs = refsOf('imperium-maledictum', 'vystrel');
    expect(refs).toContain('brosok.success');
    expect(refs).toContain('brosok.margin');
  });
});
