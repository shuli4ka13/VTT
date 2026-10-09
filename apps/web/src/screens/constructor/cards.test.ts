import { describe, it, expect } from 'vitest';
import { groupSteps, BRICKS, moveGroup, removeSteps } from './cards.ts';
import { world as W } from '@vtt/schema';
import type { System, Step } from '@vtt/schema';

const steps = (list: object[]) => list as unknown as Step[];
const system = { tables: {}, constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ sides: 20 }] } }, effects: {} } as unknown as System;

const pair = (id: string) => [
  { id: `${id}_бросок`, type: 'roll', die: 'lead', by: { expr: '@действующий' } },
  { id, type: 'check', value: { expr: `@${id}_бросок` }, versus: { expr: '10' } },
];

describe('groupSteps', () => {
  it('бросок с «Бросает» и проверка склеиваются в одну проверку, расчёт и изменение — в одно изменение', () => {
    const groups = groupSteps(steps([
      ...pair('hit'),
      { id: 'dmg', type: 'roll', fixed: { expr: '1' } },
      { type: 'apply', value: { expr: '@dmg' } },
    ]));
    expect(groups.map(g => g.kind)).toEqual(['check', 'change']);
    expect(groups[0]!.indices).toEqual([0, 1]);
    expect(groups[0]!.amount?.id).toBe('hit_бросок');
    expect(groups[1]!.indices).toEqual([2, 3]);
    expect(groups[1]!.amount?.id).toBe('dmg');
  });

  it('бросок без «Бросает» с проверкой не склеивается: это расчёт', () => {
    const groups = groupSteps(steps([
      { id: 'n', type: 'roll', fixed: { expr: '1' } },
      { id: 'c', type: 'check', value: { expr: '@n' }, versus: { expr: '10' } },
    ]));
    expect(groups.map(g => g.kind)).toEqual(['number', 'check']);
  });

  it('проверка остаётся одним шагом с броском, даже если число броска читает кто-то ещё', () => {
    const groups = groupSteps(steps([
      ...pair('hit'),
      { type: 'apply', value: { expr: '@hit_бросок' } },
    ]));
    expect(groups.map(g => g.kind)).toEqual(['check', 'change']);
  });

  it('не склеивается, если на число ссылается кто-то ещё', () => {
    const groups = groupSteps(steps([
      { id: 'dmg', type: 'roll', fixed: { expr: '1' } },
      { type: 'apply', value: { expr: '@dmg' } },
      { type: 'apply', value: { expr: '@dmg' } },
    ]));
    expect(groups.map(g => g.kind)).toEqual(['number', 'change', 'change']);
  });

  it('не склеивается, если apply берёт не весь результат', () => {
    const groups = groupSteps(steps([
      { id: 'hit', type: 'roll', fixed: { expr: '1' } },
      { type: 'apply', value: { expr: '@hit.margin' } },
    ]));
    expect(groups.map(g => g.kind)).toEqual(['number', 'change']);
  });

  it('не склеивается, если число — исход проверки, а не расчёт', () => {
    const groups = groupSteps(steps([
      { id: 'm', type: 'check', value: { expr: '@цель.хп' }, versus: { expr: '0' } },
      { type: 'apply', value: { expr: '@m' } },
    ]));
    expect(groups.map(g => g.kind)).toEqual(['check', 'change']);
    expect(groups.map(g => g.indices)).toEqual([[0], [1]]);
  });
});

describe('BRICKS', () => {
  it('шаблоны шагов пишут только типы движка и ни одного тега поля', () => {
    for (const brick of BRICKS) {
      const made = brick.make(system, []);
      for (const step of made) {
        expect(['roll', 'check', 'apply', 'status', 'table', 'each', 'branch', 'end', 'stop']).toContain(step.type);
      }
      expect(JSON.stringify(made)).not.toMatch(/"tag"/);
    }
  });

  it('шаг палитры с итогом получает имя сам, и оно не сталкивается с занятыми; изменение и ход — без имени', () => {
    for (const brick of BRICKS) {
      const made = brick.make(system, []);
      if (made[0]!.type === 'each') continue;
      if (['apply', 'branch', 'stop'].includes(made[0]!.type)) { for (const step of made) expect(step.id, brick.key).toBeUndefined(); continue; }
      for (const step of made) expect(step.id, brick.key).toBeTruthy();
      const used = made.map(step => String(step.id));
      const again = brick.make(system, used);
      for (const step of again) expect(used, brick.key).not.toContain(step.id);
    }
  });

  it('«+ если» кладёт пустой блок: метка «Если» без условия и метка конца; «+ стоп» — стоп без текста', () => {
    expect(BRICKS.find(b => b.key === 'branch')!.make(system, [])).toEqual([{ type: 'branch' }, { type: 'end' }]);
    expect(BRICKS.find(b => b.key === 'stop')!.make(system, [])).toEqual([{ type: 'stop' }]);
  });

  it('«+ проверка» отдаёт пару: бросок с «Бросает» и проверку, читающую его', () => {
    const [roll, check] = BRICKS.find(b => b.key === 'check')!.make(system, []) as unknown as Record<string, any>[];
    expect(roll).toMatchObject({ type: 'roll', by: { expr: '@действующий' } });
    expect(check).toMatchObject({ type: 'check', value: { expr: `@${roll!.id}` } });
    expect(groupSteps([roll, check] as unknown as Step[]).map(g => g.kind)).toEqual(['check']);
  });
});

describe('moveGroup', () => {
  const chain = () => steps([
    ...pair('a'),
    { id: 'n', type: 'roll', fixed: { expr: '1' } },
    { type: 'apply', value: { expr: '@n' } },
    { type: 'status', effect: 'горение', to: { expr: '@цель' } },
  ]);

  it('склеенная пара переносится целиком, а не половиной', () => {
    const moved = moveGroup(chain(), 1, -1);
    expect(moved.map(s => s.type)).toEqual(['roll', 'apply', 'roll', 'check', 'status']);
    expect(groupSteps(moved).map(g => g.kind)).toEqual(['change', 'check', 'change']);
  });

  it('перенос вниз меняет соседей местами', () => {
    const moved = moveGroup(chain(), 0, 1);
    expect(moved.map(s => s.type)).toEqual(['roll', 'apply', 'roll', 'check', 'status']);
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
      { id: 'dmg', type: 'roll', fixed: { expr: '1' } },
      { type: 'status', effect: 'горение', to: { expr: '@цель' }, args: { ходов: { expr: '@dmg' } } },
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
});

describe('удаление шага чистит ссылки на него', () => {
  it('ссылка на результат, условие «выполнять» и вложенная прибавка очищаются, формула — только называется', () => {
    const list = steps([
      { id: 'hit', type: 'check', value: { expr: '@цель.хп' }, versus: { expr: '10' } },
      { id: 'n', type: 'roll', die: { expr: '"1d8"' } },
      { type: 'apply', target: { expr: '@цель.hp' }, value: { expr: '@n' }, if: { expr: '@hit.success' } },
      { id: 'again', type: 'roll', die: 'lead', bonus: { expr: '@n' } },
      { type: 'check', value: { expr: '@again' }, versus: { expr: '#n + 1' } },
    ]);
    const removal = removeSteps(list, [1]);
    expect(removal.steps).toHaveLength(4);
    expect(removal.steps[1]).toEqual({ type: 'apply', target: { expr: '@цель.hp' }, if: { expr: '@hit.success' } });
    expect((removal.steps[2] as { bonus?: unknown }).bonus).toBeUndefined();
    expect(removal.cleared).toEqual([
      { step: 1, slot: 'value' },
      { step: 2, slot: 'bonus' },
      { step: 3, slot: 'versus (формула)' },
    ]);
    expect(list[2]).toHaveProperty('value');
  });

  it('шаг без имени убирается молча', () => {
    const list = steps([{ type: 'apply', target: { expr: '@цель.hp' }, value: { expr: '1' } }, { type: 'apply', target: { expr: '@цель.hp' }, value: { expr: '2' } }]);
    const removal = removeSteps(list, [0]);
    expect(removal.steps).toHaveLength(1);
    expect(removal.cleared).toEqual([]);
  });
});

describe('склейка «число + изменение» смотрит на ссылки, а не на текст', () => {
  it('имя шага внутри слова в чужой формуле склейку не делает', () => {
    const list = steps([
      { id: 'n', type: 'roll', fixed: { expr: '1' } },
      { type: 'apply', target: { expr: '@цель.hp' }, direction: 'subtract', value: { expr: '@n' } },
      { type: 'apply', target: { expr: '@цель.hp' }, direction: 'subtract', value: { expr: '#nn + 1' } },
    ]);
    const cards = groupSteps(list);
    expect(cards).toHaveLength(2);
    expect(cards[0]!.indices).toEqual([0, 1]);
  });

  it('имя шага в подписи или теге за ссылку не считается', () => {
    const list = steps([
      { id: 'n', type: 'roll', fixed: { expr: '1' } },
      { type: 'apply', target: { expr: '@цель.hp' }, direction: 'subtract', value: { expr: '@n' } },
      { type: 'emit', effect: 'damage', args: { amount: { expr: '1' } }, tags: ['#n', 'n'] },
    ]);
    expect(groupSteps(list)[0]!.indices).toEqual([0, 1]);
  });

  it('настоящее упоминание в формуле дальше по цепочке склейку отменяет', () => {
    const list = steps([
      { id: 'n', type: 'roll', fixed: { expr: '1' } },
      { type: 'apply', target: { expr: '@цель.hp' }, direction: 'subtract', value: { expr: '@n' } },
      { type: 'apply', target: { expr: '@цель.hp' }, direction: 'subtract', value: { expr: '#n + 1' } },
    ]);
    expect(groupSteps(list).map(c => c.indices)).toEqual([[0], [1], [2]]);
  });
});
