import { describe, it, expect } from 'vitest';
import { perform } from '../src/core/perform.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import { armsOf, sees, balance, lazyPlan } from '../src/model/flow.ts';
import { setArmor } from '../src/model/toggles.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const sub = (amount: string, field = '@цель.хп') => ({ type: 'apply', target: { expr: field }, direction: 'subtract', value: { expr: amount } });
const IF = (expr: string) => ({ type: 'branch', if: { expr } });
const ELIF = (expr: string) => ({ type: 'orElse', if: { expr } });
const ELSE = { type: 'orElse' };
const END = { type: 'end' };

const ACTOR = { key: 'действующий', label: 'Кто действует', kind: 'sheet' };
const TARGETS = { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' } };
const EACH = { type: 'each', of: 'цели' };

function world(steps: unknown[], params: unknown[] = [ACTOR, TARGETS]): System {
  return {
    id: 'ветки', name: 'Ветки',
    constants: { к6: { label: 'к6', kind: 'die', dice: [{ count: 1, sides: 6 }] } },
    tables: {
      лист: { shape: 'single', owner: 'sheet', columns: [
        { key: 'хп', label: 'Хиты', kind: 'number', default: 20 },
        { key: 'ки', label: 'Ки', kind: 'number', default: 0 },
      ] },
      приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
    },
    effects: { удар: { label: 'Удар', activation: 'manual', params, steps } },
  } as unknown as System;
}

const book: Compendium = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] } as Compendium;
const sheet = (id: string, values: Record<string, number> = {}): Sheet =>
  ({ id, systemId: 'ветки', name: id, values: { хп: 20, ...values }, has: [{ of: 'приём' }], effects: [] } as Sheet);
const hp = (out: { sheets: Sheet[] }, id: string) => out.sheets.find(s => s.id === id)!.values.хп;

const strike = (system: System, sheets: Sheet[], dice: number[] = []) =>
  perform({ system, compendium: book, clock: null, sheets, die: queue(...dice) },
    { op: 'act', intent: { actionId: 'приём:0', fromId: 'а', toIds: ['б'] } }) as { sheets: Sheet[] };

describe('Если / Иначе, если / Иначе', () => {
  const steps = [
    EACH,
    IF('@цель.ки == 1'), sub('1'),
    ELIF('@цель.ки == 2'), sub('2'),
    ELSE, sub('7'),
    END,
    sub('100', '@действующий.хп'),
  ];
  const system = world(steps);

  it('берётся ровно одна рука — первая верная; шаги после блока идут всегда', () => {
    expect(hp(strike(system, [sheet('а'), sheet('б', { ки: 1 })]), 'б')).toBe(19);
    expect(hp(strike(system, [sheet('а'), sheet('б', { ки: 2 })]), 'б')).toBe(18);
    const other = strike(system, [sheet('а'), sheet('б', { ки: 5 })]);
    expect(hp(other, 'б')).toBe(13);
    expect(hp(other, 'а')).toBe(-80);
  });

  it('система без ошибок линта', () => {
    expect(errorsOf(lintSystem(system, book))).toEqual([]);
  });

  it('вложенный блок живёт только во взятой руке', () => {
    const nested = world([
      EACH,
      IF('@цель.ки > 0'),
      IF('@цель.ки > 5'), sub('10'), ELSE, sub('1'), END,
      ELSE, sub('3'),
      END,
    ]);
    expect(hp(strike(nested, [sheet('а'), sheet('б', { ки: 9 })]), 'б')).toBe(10);
    expect(hp(strike(nested, [sheet('а'), sheet('б', { ки: 2 })]), 'б')).toBe(19);
    expect(hp(strike(nested, [sheet('а'), sheet('б', { ки: 0 })]), 'б')).toBe(17);
  });
});

describe('Стоп', () => {
  it('в теле — стоп для цели: сделанное до стопа остаётся, ниже — нет', () => {
    const system = world([EACH, sub('2'), IF('@цель.ки < 1'), { type: 'stop', note: { expr: '"нет ки"' } }, END, sub('10')]);
    expect(hp(strike(system, [sheet('а'), sheet('б')]), 'б')).toBe(18);
    expect(hp(strike(system, [sheet('а'), sheet('б', { ки: 1 })]), 'б')).toBe(8);
  });

  it('до «Для каждого из» — действие не состоялось, со словами из «в журнал»', () => {
    const system = world([IF('@действующий.ки < 1'), { type: 'stop', note: { expr: '"не хватает ки"' } }, END, EACH, sub('5')]);
    expect(() => strike(system, [sheet('а'), sheet('б')])).toThrow(/не состоялось: не хватает ки/);
    expect(hp(strike(system, [sheet('а', { ки: 1 }), sheet('б')]), 'б')).toBe(15);
  });
});

describe('ленивые броски до «Для каждого из»', () => {
  it('блок из одних ленивых бросков не бросает кость, пока её никто не прочёл', () => {
    const system = world([
      { id: 'урон', type: 'roll', die: 'к6' },
      IF('@урон >= 6'), { id: 'добавка', type: 'roll', fixed: { expr: '5' } }, END,
      EACH,
      IF('@цель.ки > 0'), sub('@урон'), IF('@урон >= 6'), sub('@добавка'), END, END,
    ]);
    expect(hp(strike(system, [sheet('а'), sheet('б')], []), 'б')).toBe(20);
    expect(hp(strike(system, [sheet('а'), sheet('б', { ки: 1 })], [6]), 'б')).toBe(9);
    expect(hp(strike(system, [sheet('а'), sheet('б', { ки: 1 })], [3]), 'б')).toBe(17);
  });

  it('план: условие руки становится условием ленивого шага; метки блока прячутся', () => {
    const steps = [IF('@a'), { id: 'x' }, ELSE, { id: 'y' }, END] as { type?: string; if?: unknown }[];
    const plan = lazyPlan(steps, index => index === 1 || index === 3);
    expect(plan.guards.get(1)).toBe('@a');
    expect(plan.guards.get(3)).toBe('not @a');
    expect([...plan.hidden].sort()).toEqual([0, 2, 4]);
  });
});

describe('устройство блоков', () => {
  const steps = [{ type: 'roll', id: 'a' }, IF('да'), { type: 'roll', id: 'b' }, ELSE, { type: 'roll', id: 'c' }, END, { type: 'roll', id: 'd' }];

  it('соседняя рука не видна, внешнее и закрытый блок — видны', () => {
    const arms = armsOf(steps);
    expect(sees(arms, 2, 4)).toBe(false);
    expect(sees(arms, 0, 4)).toBe(true);
    expect(sees(arms, 2, 6)).toBe(true);
  });

  it('условие «Иначе, если» не видит имён прежней руки — её шаги там не выполнялись', () => {
    const chain = [IF('да'), { type: 'roll', id: 'x' }, ELIF('@x > 3'), { type: 'roll', id: 'y' }, END];
    const arms = armsOf(chain);
    expect(sees(arms, 1, 2)).toBe(false);
    expect(sees(arms, 2, 3)).toBe(true);
  });

  it('баланс: незакрытый «Если», «Иначе» без «Если», «Иначе» после «Иначе»', () => {
    expect(balance([IF('да')]).map(p => p.problem)).toEqual(['«Если» не закрыт']);
    expect(balance([ELSE]).map(p => p.problem)).toEqual(['«Иначе» без «Если» выше']);
    expect(balance([IF('да'), ELSE, ELSE, END]).map(p => p.problem)).toEqual(['«Иначе» после «Иначе» без условия — сюда не дойдёт']);
  });

  it('линт: «Если» и «Иначе, если» с пустым условием — ошибка, а не «всегда»', () => {
    for (const steps of [
      [EACH, { type: 'branch' }, sub('1'), END],
      [EACH, { type: 'branch', if: { expr: '' } }, sub('1'), END],
      [EACH, IF('да'), sub('1'), { type: 'orElse', if: { expr: '  ' } }, sub('2'), END],
    ]) {
      expect(errorsOf(lintSystem(world(steps), book)).map(p => p.text)).toContain('не заполнено: условие');
    }
  });

  it('линт: условие на обычном шаге и «Для каждого из» внутри блока — ошибки', () => {
    const own = world([EACH, { ...sub('1'), if: { expr: 'true' } }]);
    expect(errorsOf(lintSystem(own, book)).map(p => p.text)).toContain('у шага своё условие — условие теперь ставится блоком «Если»');
    const looped = world([IF('да'), EACH, END, sub('1')]);
    expect(errorsOf(lintSystem(looped, book)).map(p => p.text).join('\n')).toMatch(/не ставится внутрь «Если»/);
  });
});

describe('переключатель брони и блоки', () => {
  it('меняет только хвост брони, соседний блок верхнего уровня цел', () => {
    const draft = {
      effects: {
        урон: {
          label: 'Урон', params: [{ key: 'лист', label: 'Лист', kind: 'sheet' }, { key: 'amount', label: 'Amount', kind: 'number', role: 'amount' }],
          steps: [
            { type: 'apply', target: { expr: '@лист.хп' }, value: { expr: '@amount' } },
            IF('@amount > 10'), { type: 'apply', target: { expr: '@лист.ки' }, value: { expr: '1' } }, END,
          ],
        },
      },
    } as unknown as System;
    setArmor(draft, 'threshold', { event: 'урон', armor: 'броня', hp: 'хп' });
    const steps = (draft.effects.урон!.steps ?? []).map(step => step.type);
    expect(steps).toEqual(['check', 'branch', 'stop', 'end', 'apply', 'branch', 'apply', 'end']);
    expect((draft.effects.урон!.steps![5] as { if?: { expr?: string } }).if?.expr).toBe('@amount > 10');
  });
});
