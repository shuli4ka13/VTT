import { describe, it, expect } from 'vitest';
import { lintSystem } from '../src/model/lint.ts';
import { SAMPLE_WORLDS, LITE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';

describe('«Проблемы»: правка броска, которой не на что действовать', () => {
  const base = (extra: Record<string, unknown> = {}) => ({
    id: 'с', name: 'с',
    constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
    tables: { лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'сила', label: 'Сила', kind: 'number' }] } },
    rolls: { проверка: { label: 'Проверка', die: 'к20', fields: [{ table: 'лист', column: 'сила' }] } },
    effects: {},
    ...extra,
  });
  const idle = (system: unknown): string[] =>
    lintSystem(system as never).filter(one => one.level === 'warn' && one.text.includes('ничего не изменит')).map(one => one.text);
  const degree = { рывок: { label: 'Рывок', ops: [{ op: 'shiftDegree', by: 1 }] } };
  const versus = { легче: { label: 'Легче', ops: [{ op: 'shiftVersus', by: -2 }] } };

  it('сдвиг степени без ступеней в системе — замечание; со ступенями у правила — чисто', () => {
    expect(idle(base({ roll_edits: degree })).length).toBe(1);
    const graded = base({ roll_edits: degree });
    (graded.rolls.проверка as Record<string, unknown>).degrees = [{ label: 'крит', if: { expr: '@выпало >= 20' } }];
    expect(idle(graded)).toEqual([]);
  });

  it('сдвиг порога, когда сравнивать не с чем, — замечание; с «Проверкой» в эффекте — чисто', () => {
    expect(idle(base({ roll_edits: versus })).length).toBe(1);
    const checked = base({ roll_edits: versus, effects: { удар: { label: 'Удар', params: [], steps: [
      { id: 'бросок', type: 'roll', die: 'к20' }, { id: 'проверка', type: 'check', value: { expr: '@бросок' }, versus: { expr: '10' } },
    ] } } });
    expect(idle(checked)).toEqual([]);
  });

  it('у образцов таких замечаний нет', () => {
    for (const world of [...SAMPLE_WORLDS, ...LITE_WORLDS]) expect(idle(flattenSystem(world.system)), world.system.name).toEqual([]);
  });
});
