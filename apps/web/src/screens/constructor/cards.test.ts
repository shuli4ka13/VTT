import { describe, it, expect } from 'vitest';
import { groupSteps, BRICKS, moveGroup, removeSteps } from './cards.ts';
import { world as W } from '@vtt/schema';
import type { System, Effect, Step } from '@vtt/schema';

const steps = (list: object[]) => list as unknown as Step[];
const system = { tables: {}, constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ sides: 20 }] } }, effects: {} } as unknown as System;

const thrown = (id: string) => ({ id, type: 'roll', die: 'lead', by: { expr: '@действующий' } });
const compared = (id: string, over: string) => ({ id: `${id}_против`, type: 'check', value: { expr: `@${id}` }, versus: { expr: over } });

describe('groupSteps', () => {
  it('бросок и проверка — два шага на экране, не склеиваются; расчёт и изменение — одно изменение', () => {
    const groups = groupSteps(steps([
      thrown('hit'),
      compared('hit', '10'),
      { id: 'dmg', type: 'roll', fixed: { expr: '1' } },
      { type: 'apply', value: { expr: '@dmg' } },
    ]));
    expect(groups.map(g => g.kind)).toEqual(['roll', 'check', 'change']);
    expect(groups.map(g => g.indices)).toEqual([[0], [1], [2, 3]]);
    expect(groups[2]!.amount?.id).toBe('dmg');
  });

  it('вид «Бросок» дают by, field и кость; fixed и пустой шаг — «Число»', () => {
    const groups = groupSteps(steps([
      { id: 'a', type: 'roll', by: { expr: '@действующий' } },
      { id: 'b', type: 'roll', field: { expr: '@цель.armor' } },
      { id: 'c', type: 'roll', die: 'lead' },
      { id: 'd', type: 'roll', fixed: { expr: '1' } },
      { id: 'e', type: 'roll' },
    ]));
    expect(groups.map(g => g.kind)).toEqual(['roll', 'roll', 'roll', 'number', 'number']);
  });

  it('кость без бросающего — расчёт: «число + изменение» склеиваются, величина — «кость + прибавка»', () => {
    const groups = groupSteps(steps([
      { id: 'dmg', type: 'roll', die: 'lead', bonus: { expr: '1' } },
      { type: 'apply', value: { expr: '@dmg' } },
    ]));
    expect(groups.map(g => g.kind)).toEqual(['change']);
    expect(groups[0]!.indices).toEqual([0, 1]);
    expect(groups[0]!.amount?.id).toBe('dmg');
  });

  it('бросок в склейку «число + изменение» не входит, даже если изменение берёт его целиком', () => {
    const groups = groupSteps(steps([
      thrown('hit'),
      { type: 'apply', value: { expr: '@hit' } },
    ]));
    expect(groups.map(g => g.kind)).toEqual(['roll', 'change']);
    expect(groups.map(g => g.indices)).toEqual([[0], [1]]);
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
        expect(['roll', 'check', 'apply', 'status', 'emit', 'table', 'ask', 'each', 'branch', 'end', 'stop']).toContain(step.type);
      }
      expect(JSON.stringify(made)).not.toMatch(/"tag"/);
    }
  });

  it('шаг палитры с итогом получает имя сам, и оно не сталкивается с занятыми; изменение, вызов и ход — без имени', () => {
    for (const brick of BRICKS) {
      const made = brick.make(system, []);
      if (made[0]!.type === 'each') continue;
      if (['apply', 'emit', 'branch', 'stop'].includes(made[0]!.type)) { for (const step of made) expect(step.id, brick.key).toBeUndefined(); continue; }
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

  const brick = (key: string, effect?: object, sheets?: Map<string, string>, taken: string[] = []) =>
    BRICKS.find(b => b.key === key)!.make(system, taken, effect as Effect | undefined, sheets) as unknown as Record<string, any>[];

  const inputs = (...list: [string, boolean?][]) => ({
    params: list.map(([key, many]) => ({ key, label: key, kind: 'sheet', ...(many ? { many: true } : {}) })),
  });

  it('«+ бросок» кладёт один шаг: первая кость системы и первый одиночный лист, список целей пропускается', () => {
    const made = brick('roll', inputs(['цели', true], ['атакующий'], ['защитник']));
    expect(made).toEqual([{ id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@атакующий' } }]);
    expect(groupSteps(made as unknown as Step[]).map(g => g.kind)).toEqual(['roll']);
  });

  it('«+ бросок» без листа или без кости не выдумывает их; без листа шаг с костью — всё равно «Бросок», без кости — «Число»', () => {
    for (const effect of [{ params: [{ key: 'сколько', label: 'Сколько', kind: 'number' }] }, inputs(['цели', true]), undefined]) {
      const made = brick('roll', effect);
      expect(made[0]).not.toHaveProperty('by');
      expect(groupSteps(made as unknown as Step[]).map(g => g.kind)).toEqual([(made[0] as { die?: unknown }).die ? 'roll' : 'number']);
    }
    const bare = BRICKS.find(b => b.key === 'roll')!.make({ tables: {}, constants: {}, effects: {} } as unknown as System, [], inputs(['кто']) as unknown as Effect);
    expect(bare[0]).not.toHaveProperty('die');
  });

  it('в месте шага бросающий — первый одиночный лист этого места: в подписке и наложении это носитель', () => {
    const sheets = new Map([['носитель', 'носитель — тот, на ком висит'], ['лист', 'лист, с которым это случилось'], ['цели', 'Цели']]);
    expect(brick('roll', { params: [] }, sheets)[0]).toMatchObject({ by: { expr: '@носитель' } });
    expect(brick('roll', inputs(['цели', true]), new Map([['цели', 'Цели'], ['цель', 'Цель']]))[0]).toMatchObject({ by: { expr: '@цель' } });
    expect(brick('roll', { params: [] }, new Map())[0]).not.toHaveProperty('by');
  });

  it('«+ проверка» кладёт один шаг: без пары и без имён «_бросок»; порог 10', () => {
    const made = brick('check', inputs(['действующий']));
    expect(made).toEqual([{ id: 'проверка', type: 'check', versus: { expr: '10' } }]);
  });

  it('«+ проверка» берёт ближайший выше бросок, который ещё ни с чем не сравнён', () => {
    const effect = { params: [], steps: [thrown('первый'), thrown('второй'), { id: 'число', type: 'roll', fixed: { expr: '1' } }] };
    expect(brick('check', effect)[0]).toMatchObject({ value: { expr: '@второй' }, versus: { expr: '10' } });
  });

  it('«+ проверка» пропускает уже сравнённые броски — и слева, и справа', () => {
    const left = { params: [], steps: [thrown('а'), thrown('б'), { id: 'п', type: 'check', value: { expr: '@б' }, versus: { expr: '10' } }] };
    expect(brick('check', left)[0]).toMatchObject({ value: { expr: '@а' } });
    const right = { params: [], steps: [thrown('а'), thrown('б'), { id: 'п', type: 'check', value: { expr: '5' }, versus: { expr: '@б' } }] };
    expect(brick('check', right)[0]).toMatchObject({ value: { expr: '@а' } });
  });

  it('«+ проверка» без свободного броска оставляет «что проверяем» пустым', () => {
    const effect = { params: [], steps: [thrown('а'), compared('а', '10')] };
    expect(brick('check', effect)[0]).not.toHaveProperty('value');
    expect(brick('check', undefined)[0]).not.toHaveProperty('value');
  });

  it('«+ число» — один расчётный шаг с нулём', () => {
    expect(brick('number', undefined)).toEqual([{ id: 'число', type: 'roll', fixed: { expr: '0' } }]);
    expect(groupSteps(brick('number', undefined) as unknown as Step[]).map(g => g.kind)).toEqual(['number']);
  });
});

describe('moveGroup', () => {
  const chain = () => steps([
    thrown('a'),
    compared('a', '10'),
    { id: 'n', type: 'roll', fixed: { expr: '1' } },
    { type: 'apply', value: { expr: '@n' } },
    { type: 'status', effect: 'горение', to: { expr: '@цель' } },
  ]);

  it('склеенные «число + изменение» переносятся целиком, а не половиной', () => {
    const moved = moveGroup(chain(), 2, -1);
    expect(moved.map(s => s.type)).toEqual(['roll', 'roll', 'apply', 'check', 'status']);
    expect(groupSteps(moved).map(g => g.kind)).toEqual(['roll', 'change', 'check', 'change']);
  });

  it('бросок и проверка переносятся каждый сам, перенос вниз меняет соседей местами', () => {
    const moved = moveGroup(chain(), 0, 1);
    expect(moved.map(s => s.type)).toEqual(['check', 'roll', 'roll', 'apply', 'status']);
  });

  it('за край не двигает', () => {
    const source = chain();
    expect(moveGroup(source, 0, -1)).toBe(source);
    expect(moveGroup(source, 3, 1)).toBe(source);
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
