import { describe, it, expect } from 'vitest';
import { groupSteps, BRICKS, moveGroup } from './cards.ts';
import { world as W } from '@vtt/schema';
import type { System, Step } from '@vtt/schema';

const steps = (list: object[]) => list as unknown as Step[];
const system = { fields: [], constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ sides: 20 }] } }, effects: {} } as unknown as System;

describe('groupSteps', () => {
  it('пара amount+apply склеивается в одно изменение', () => {
    const groups = groupSteps(steps([
      { type: 'threshold' },
      { id: 'dmg', type: 'amount', source: 'roll' },
      { type: 'apply', value: { ref: 'dmg' } },
    ]));
    expect(groups.map(g => g.kind)).toEqual(['check', 'change']);
    expect(groups[1]!.indices).toEqual([1, 2]);
    expect(groups[1]!.amount?.id).toBe('dmg');
  });

  it('не склеивается, если на число ссылается кто-то ещё', () => {
    const groups = groupSteps(steps([
      { id: 'dmg', type: 'amount', source: 'roll' },
      { type: 'apply', value: { ref: 'dmg' } },
      { type: 'apply', value: { ref: 'dmg' } },
    ]));
    expect(groups.map(g => g.kind)).toEqual(['number', 'change', 'change']);
  });

  it('не склеивается, если apply берёт не весь результат', () => {
    const groups = groupSteps(steps([
      { id: 'hit', type: 'amount', source: 'roll' },
      { type: 'apply', value: { ref: 'hit.margin' } },
    ]));
    expect(groups.map(g => g.kind)).toEqual(['number', 'change']);
  });

  it('не склеивается, если источник числа — превышение проверки или запись', () => {
    const groups = groupSteps(steps([
      { id: 'm', type: 'amount', source: 'margin' },
      { type: 'apply', value: { ref: 'm' } },
    ]));
    expect(groups.map(g => g.kind)).toEqual(['number', 'change']);
  });
});

describe('BRICKS', () => {
  it('шаблоны шагов пишут только типы движка и ни одного тега поля', () => {
    for (const brick of BRICKS) {
      const made = brick.make(system, []);
      for (const step of made) {
        expect(['threshold', 'amount', 'compare', 'apply', 'status']).toContain(step.type);
      }
      expect(JSON.stringify(made)).not.toMatch(/"tag"/);
    }
  });

  it('имя нового числа не сталкивается с занятыми', () => {
    const number = BRICKS.find(b => b.key === 'number')!;
    expect(number.make(system, ['n'])[0]!.id).toBe('n_2');
  });
});

describe('moveGroup', () => {
  const chain = () => steps([
    { type: 'threshold' },
    { id: 'n', type: 'amount', source: 'roll' },
    { type: 'apply', value: { ref: 'n' } },
    { type: 'status', mode: 'apply' },
  ]);

  it('склеенная пара переносится целиком, а не половиной', () => {
    const moved = moveGroup(chain(), 1, -1);
    expect(moved.map(s => s.type)).toEqual(['amount', 'apply', 'threshold', 'status']);
    expect(groupSteps(moved).map(g => g.kind)).toEqual(['change', 'check', 'change']);
  });

  it('перенос вниз меняет соседей местами', () => {
    const moved = moveGroup(chain(), 0, 1);
    expect(moved.map(s => s.type)).toEqual(['amount', 'apply', 'threshold', 'status']);
  });

  it('за край не двигает', () => {
    const source = chain();
    expect(moveGroup(source, 0, -1)).toBe(source);
    expect(moveGroup(source, 2, 1)).toBe(source);
  });
});

describe('склейка и состояние', () => {
  it('переключение «поле → состояние» не разваливает шаг', () => {
    const groups = groupSteps(steps([
      { id: 'dmg', type: 'amount', source: 'roll' },
      { type: 'status', mode: 'apply', value: { ref: 'dmg' } },
    ]));
    expect(groups.map(g => g.kind)).toEqual(['change']);
    expect(groups[0]!.amount?.id).toBe('dmg');
  });
});

describe('BRICKS дают документ, который примет сервер', () => {
  for (const brick of BRICKS) {
    it(`«${brick.label}» проходит схему шага`, () => {
      for (const step of brick.make(system, [])) {
        const parsed = W.step.safeParse(step);
        expect(parsed.success ? null : parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`))
          .toBe(null);
      }
    });
  }

  it('проверка не пишет сторону, пока автор её не выбрал', () => {
    const [step] = BRICKS.find(b => b.key === 'check')!.make(system, []);
    expect(step).not.toHaveProperty('side');
  });
});
