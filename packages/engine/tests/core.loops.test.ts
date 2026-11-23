import { describe, it, expect } from 'vitest';
import { act } from '../src/core/act.ts';
import { emptyJournal } from '../src/core/external.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import { fireMoments } from './kit.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const ACTOR = { key: 'действующий', label: 'Кто действует', kind: 'sheet', role: 'actor' };
const TARGETS = { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' } };
const WHAT = { key: 'что', label: 'Что', kind: 'choice', from: 'запасы' };

const world = (effects: Record<string, unknown>, bindings: unknown[]): System => ({
  id: 'циклы', name: 'Циклы',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }] },
    запасы: {
      shape: 'rows', owner: 'sheet', key: 'word', label: 'Запасы',
      columns: [
        { key: 'всего', label: 'Всего', kind: 'number', default: 0 },
        { key: 'осталось', label: 'Осталось', kind: 'number', min: 0, default: 0 },
        { key: 'коротко', label: 'Восполняется коротким отдыхом', kind: 'boolean' },
        { key: 'пара', label: 'Пара', kind: 'choice', from: 'запасы' },
      ],
      rows: [
        { value: 'ки', label: 'Ки', cells: { коротко: true, пара: 'ярость' } },
        { value: 'ярость', label: 'Ярость', cells: { коротко: false, пара: 'ки' } },
      ],
    },
    ячейки: {
      shape: 'rows', owner: 'sheet', key: 'number', label: 'Ячейки',
      columns: [{ key: 'осталось', label: 'Осталось', kind: 'number', min: 0, default: 0 }],
      rows: [{ value: 1, label: '1-й круг' }, { value: 2, label: '2-й круг' }],
    },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings },
  },
  effects: effects as System['effects'],
} as unknown as System);

const book: Compendium = { records: [{ id: 'приём', table: 'приём', label: 'Приём', cells: {} }] } as Compendium;

const sheet = (id: string, values: Record<string, unknown> = {}, effects: string[] = []): Sheet =>
  ({ id, systemId: 'циклы', name: id, values: { хп: 20, ...values }, has: [{ of: 'приём' }], effects: effects.map(effectId => ({ effectId })) } as Sheet);

const play = (system: System, sheets: Sheet[], toIds: string[] = [], dice: number[] = [], action = 0) =>
  act({ system, compendium: book, clock: null, sheets, die: queue(...dice), journal: emptyJournal() },
    { actionId: `приём:${action}`, fromId: 'а', toIds }) as { kind: string; sheets: Sheet[]; log: string[] };

const value = (out: { sheets: Sheet[] }, id: string, key: string) => out.sheets.find(s => s.id === id)!.values[key];

const spend = (target: string, amount = '1') => ({ type: 'apply', target: { expr: target }, direction: 'subtract', value: { expr: amount } });

describe('«Изменение» пишет туда же, откуда читает формула', () => {
  it('вход «строка таблицы» называет строку: @лист.что.колонка', () => {
    const system = world({
      трата: { label: 'Трата', activation: 'manual', params: [ACTOR, WHAT], steps: [spend('@действующий.что.осталось')] },
    }, [{ label: 'Трата', effect: 'трата', args: { что: 'ки' } }]);
    const out = play(system, [sheet('а', { 'запасы.ки.осталось': 3, 'запасы.ярость.осталось': 3 })]);
    expect(value(out, 'а', 'запасы.ки.осталось')).toBe(2);
    expect(value(out, 'а', 'запасы.ярость.осталось')).toBe(3);
  });

  it('колонка по значению: @лист.таблица.[формула].колонка, ключ строки — число', () => {
    const system = world({
      ячейка: { label: 'Ячейка', activation: 'manual', params: [ACTOR, { key: 'круг', label: 'Круг', kind: 'number' }], steps: [spend('@действующий.ячейки.[@круг].осталось')] },
    }, [{ label: 'Ячейка', effect: 'ячейка', args: { круг: 2 } }]);
    const out = play(system, [sheet('а', { 'ячейки.1.осталось': 4, 'ячейки.2.осталось': 1 })]);
    expect(value(out, 'а', 'ячейки.2.осталось')).toBe(0);
    expect(value(out, 'а', 'ячейки.1.осталось')).toBe(4);
  });

  it('переход по колонке-ссылке: пишется клетка строки, на которую она указывает', () => {
    const system = world({
      пара: { label: 'Пара', activation: 'manual', params: [ACTOR, WHAT], steps: [spend('@действующий.что.пара.осталось')] },
    }, [{ label: 'Пара', effect: 'пара', args: { что: 'ки' } }]);
    const out = play(system, [sheet('а', { 'запасы.ки.осталось': 3, 'запасы.ярость.осталось': 3 })]);
    expect(value(out, 'а', 'запасы.ярость.осталось')).toBe(2);
    expect(value(out, 'а', 'запасы.ки.осталось')).toBe(3);
  });

  it('вход-поле вызова принимает тот же адрес', () => {
    const system = world({
      потратить: {
        label: 'Потратить', params: [{ key: 'лист', label: 'Лист', kind: 'sheet', role: 'actor' }, { key: 'what', label: 'Что тратим', kind: 'field' }],
        steps: [spend('@what')],
      },
      трата: {
        label: 'Трата', activation: 'manual', params: [ACTOR, WHAT],
        steps: [{ type: 'emit', effect: 'потратить', args: { what: { expr: '@действующий.что.осталось' } } }],
      },
    }, [{ label: 'Трата', effect: 'трата', args: { что: 'ярость' } }]);
    const out = play(system, [sheet('а', { 'запасы.ярость.осталось': 2 })]);
    expect(value(out, 'а', 'запасы.ярость.осталось')).toBe(1);
  });

  it('строка не задана — отказ словами, а не «не поле листа»', () => {
    const system = world({
      трата: { label: 'Трата', activation: 'manual', params: [ACTOR, { ...WHAT, optional: true }], steps: [spend('@действующий.что.осталось')] },
    }, [{ label: 'Трата', effect: 'трата', args: {} }]);
    expect(() => play(system, [sheet('а')])).toThrow(/«что» не задан/);
  });

  it('строки нет в таблице — отказ называет таблицу и строку', () => {
    const system = world({
      ячейка: { label: 'Ячейка', activation: 'manual', params: [ACTOR, { key: 'круг', label: 'Круг', kind: 'number' }], steps: [spend('@действующий.ячейки.[@круг].осталось')] },
    }, [{ label: 'Ячейка', effect: 'ячейка', args: { круг: 7 } }]);
    expect(() => play(system, [sheet('а')])).toThrow(/нет строки «7»/);
  });
});

describe('цикл по листам — только у действия кнопкой', () => {
  const volley = {
    label: 'Залп', params: [ACTOR, TARGETS], steps: [{ type: 'each', of: 'цели' }, spend('@цель.хп', '3')],
  };
  const caller = {
    label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS],
    steps: [{ type: 'emit', effect: 'залп', args: { цели: { expr: '@цели' } } }],
  };

  it('вызываемый эффект с циклом по целям — ошибка линта, как раньше', () => {
    const system = world({ залп: volley, удар: caller }, [{ label: 'Удар', effect: 'удар', args: {} }]);
    expect(errorsOf(lintSystem(system, book)).map(p => p.text).join('\n')).toMatch(/вызываемый эффект не перебирает цели/);
  });

  it('цикл по целям в подписке — ошибка линта', () => {
    const system = world({
      отдых: { label: 'Отдых', activation: 'passive', duration: { kind: 'permanent' }, params: [TARGETS], on: [{ on: 'moment:short-rest', steps: [{ type: 'each', of: 'цели' }, spend('@цель.хп')] }] },
    }, []);
    expect(errorsOf(lintSystem(system, book)).map(p => p.text).join('\n')).toMatch(/цикл по целям — только у действия кнопкой/);
  });
});

describe('«Для каждой строки таблицы»', () => {
  const refill = (filter = false) => [
    { type: 'each', rows: 'запасы', as: 'запас' },
    ...(filter ? [{ type: 'branch', if: { expr: '@запас.коротко' } }] : []),
    { type: 'apply', target: { expr: '@holder.запас.осталось' }, direction: 'set', value: { expr: '@holder.запас.всего' } },
    ...(filter ? [{ type: 'end' }] : []),
  ];
  const full = { 'запасы.ки.всего': 3, 'запасы.ярость.всего': 2, 'запасы.ки.осталось': 0, 'запасы.ярость.осталось': 0 };

  it('кнопка: «осталось» каждой строки задано «всего»', () => {
    const system = world({
      восполнить: {
        label: 'Восполнить', activation: 'manual', params: [ACTOR],
        steps: [
          { type: 'each', rows: 'запасы', as: 'запас' },
          { type: 'apply', target: { expr: '@действующий.запас.осталось' }, direction: 'set', value: { expr: '@действующий.запас.всего' } },
        ],
      },
    }, [{ label: 'Восполнить', effect: 'восполнить', args: {} }]);
    const out = play(system, [sheet('а', full)]);
    expect(value(out, 'а', 'запасы.ки.осталось')).toBe(3);
    expect(value(out, 'а', 'запасы.ярость.осталось')).toBe(2);
  });

  it('подписка на отдых: условие строки — блоком «Если» внутри цикла', () => {
    const system = world({
      отдых: { label: 'Отдых', activation: 'passive', duration: { kind: 'permanent' }, on: [{ on: 'moment:short-rest', steps: refill(true) }] },
    }, []);
    const out = fireMoments([{ moment: 'short-rest', sheetId: 'а' }], [sheet('а', full, ['отдых'])], { system, compendium: book, die: () => 1 } as never);
    expect(out.sheets[0]!.values['запасы.ки.осталось']).toBe(3);
    expect(out.sheets[0]!.values['запасы.ярость.осталось']).toBe(0);
  });

  it('вызванная функция с циклом по строкам', () => {
    const system = world({
      заново: {
        label: 'Заново', params: [{ key: 'лист', label: 'Лист', kind: 'sheet', role: 'actor' }],
        steps: [
          { type: 'each', rows: 'запасы', as: 'запас' },
          { type: 'apply', target: { expr: '@лист.запас.осталось' }, direction: 'set', value: { expr: '@лист.запас.всего' } },
        ],
      },
      отдых: { label: 'Отдых', activation: 'passive', duration: { kind: 'permanent' }, on: [{ on: 'moment:long-rest', steps: [{ type: 'emit', effect: 'заново', args: { лист: { expr: '@holder' } } }] }] },
    }, []);
    const out = fireMoments([{ moment: 'long-rest', sheetId: 'а' }], [sheet('а', full, ['отдых'])], { system, compendium: book, die: () => 1 } as never);
    expect(out.sheets[0]!.values['запасы.ки.осталось']).toBe(3);
    expect(out.sheets[0]!.values['запасы.ярость.осталось']).toBe(2);
  });

  it('строка цикла — вход «строка таблицы»: строка передаётся явным аргументом', () => {
    const system = world({
      трата: { label: 'Трата', params: [{ key: 'лист', label: 'Лист', kind: 'sheet', role: 'actor' }, { ...WHAT, key: 'запас' }], steps: [spend('@лист.запас.осталось')] },
      всё: {
        label: 'Всё', activation: 'manual', params: [ACTOR],
        steps: [{ type: 'each', rows: 'запасы', as: 'запас' }, { type: 'emit', effect: 'трата', args: { лист: { expr: '@действующий' }, запас: { expr: '@запас' } } }],
      },
    }, [{ label: 'Всё', effect: 'всё', args: {} }]);
    const out = play(system, [sheet('а', { 'запасы.ки.осталось': 3, 'запасы.ярость.осталось': 3 })]);
    expect(value(out, 'а', 'запасы.ки.осталось')).toBe(2);
    expect(value(out, 'а', 'запасы.ярость.осталось')).toBe(2);
  });

  it('линт: имя строки обязательно, таблица должна быть и иметь строки', () => {
    const lint = (step: unknown) => errorsOf(lintSystem(world({
      шаг: { label: 'Шаг', activation: 'manual', params: [ACTOR, TARGETS], steps: [step, spend('@действующий.хп')] },
    }, [{ label: 'Шаг', effect: 'шаг', args: {} }]), book)).map(p => p.text).join('\n');
    expect(lint({ type: 'each', rows: 'запасы', as: 'запас' })).toBe('');
    expect(lint({ type: 'each', rows: 'запасы' })).toMatch(/как зовётся строка/);
    expect(lint({ type: 'each', rows: 'нет', as: 'x' })).toMatch(/таблицы «нет» нет/);
    expect(lint({ type: 'each', rows: 'лист', as: 'x' })).toMatch(/строк нет/);
    expect(lint({ type: 'each', rows: 'запасы', of: 'цели', as: 'x' })).toMatch(/не оба сразу/);
    expect(lint({ type: 'each', rows: 'запасы', as: 'хп' })).toMatch(/имя строки «хп» уже занято/);
    expect(lint({ type: 'each', of: 'цели', as: 'x' })).toMatch(/имя строки бывает только у цикла по таблице/);
  });

  it('итог функции не смотрит на шаг внутри цикла', () => {
    const system = world({
      счёт: {
        label: 'Счёт', params: [{ key: 'лист', label: 'Лист', kind: 'sheet', role: 'actor' }],
        returns: [{ key: 'сколько', label: 'сколько', kind: 'number', expr: { expr: '@шаг_в_цикле' } }],
        steps: [{ type: 'each', rows: 'запасы', as: 'запас' }, { id: 'шаг_в_цикле', type: 'roll', fixed: { expr: '1' } }],
      },
    }, []);
    expect(errorsOf(lintSystem(system, book)).map(p => p.text).join('\n')).toMatch(/смотрит на шаг «шаг_в_цикле» внутри цикла/);
  });

  it('«Стоп» в проходе обрывает только его, слова уходят в журнал', () => {
    const system = world({
      восполнить: {
        label: 'Восполнить', activation: 'manual', params: [ACTOR],
        steps: [
          { type: 'each', rows: 'запасы', as: 'запас' },
          { type: 'branch', if: { expr: '@действующий.запас.всего < 1' } }, { type: 'stop', note: { expr: '"пусто"' } }, { type: 'end' },
          { type: 'apply', target: { expr: '@действующий.запас.осталось' }, direction: 'set', value: { expr: '@действующий.запас.всего' } },
        ],
      },
    }, [{ label: 'Восполнить', effect: 'восполнить', args: {} }]);
    const out = play(system, [sheet('а', { 'запасы.ки.всего': 0, 'запасы.ярость.всего': 2 })]);
    expect(value(out, 'а', 'запасы.ярость.осталось')).toBe(2);
    expect(out.log.join('\n')).toMatch(/пусто/);
  });
});

describe('линт адресов', () => {
  const lint = (target: string, params: unknown[] = [ACTOR, WHAT, { key: 'круг', label: 'Круг', kind: 'number' }]) => errorsOf(lintSystem(world({
    шаг: { label: 'Шаг', activation: 'manual', params, steps: [spend(target)] },
  }, [{ label: 'Шаг', effect: 'шаг', args: { что: 'ки', круг: 1 } }]), book)).map(p => p.text).join('\n');

  it('колонка по значению с листом в голове — ссылка на таблицу, а не на поле', () => {
    expect(lint('@действующий.ячейки.[@круг].осталось')).toBe('');
    expect(lint('@действующий.ячейки.[@круг].нет_такой')).toMatch(/в таблице «Ячейки» нет колонки «нет_такой»/);
  });

  it('после строки (вход-выбор) колонка должна быть в её таблице', () => {
    expect(lint('@действующий.что.осталось')).toBe('');
    expect(lint('@действующий.что.нет_такой')).toMatch(/в таблице «Запасы» нет колонки «нет_такой»/);
  });

  it('после строки цикла — тоже', () => {
    const steps = (column: string) => [{ type: 'each', rows: 'запасы', as: 'запас' }, spend(`@действующий.запас.${column}`)];
    const of = (column: string) => errorsOf(lintSystem(world({
      шаг: { label: 'Шаг', activation: 'manual', params: [ACTOR], steps: steps(column) },
    }, [{ label: 'Шаг', effect: 'шаг', args: {} }]), book)).map(p => p.text).join('\n');
    expect(of('осталось')).toBe('');
    expect(of('нет_такой')).toMatch(/в таблице «Запасы» нет колонки «нет_такой»/);
  });
});

describe('плата подписки, вложенная в несколько вызовов', () => {
  const system = world({
    потратить: {
      label: 'Потратить', params: [{ key: 'лист', label: 'Лист', kind: 'sheet', role: 'actor' }, { key: 'what', label: 'Что тратим', kind: 'field' }],
      steps: [{ type: 'branch', if: { expr: '@what < 1' } }, { type: 'stop', note: { expr: '"нечем"' } }, { type: 'end' }, spend('@what')],
    },
    реакция: {
      label: 'Реакция', params: [{ key: 'лист', label: 'Лист', kind: 'sheet', role: 'actor' }],
      steps: [{ type: 'emit', effect: 'потратить', args: { лист: { expr: '@лист' }, what: { expr: '@лист.запасы.ки.осталось' } } }],
    },
    плата: {
      label: 'Плата', params: [{ key: 'лист', label: 'Лист', kind: 'sheet', role: 'actor' }],
      steps: [{ type: 'emit', effect: 'реакция', args: { лист: { expr: '@лист' } } }],
    },
    удар: { label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS], steps: [{ type: 'each', of: 'цели' }, spend('@цель.хп')] },
    щит: {
      label: 'Щит', activation: 'passive', duration: { kind: 'permanent' },
      on: [{ on: 'before:удар', if: { expr: '@цель == @holder' }, confirm: true, cost: [{ type: 'emit', effect: 'плата', args: { лист: { expr: '@holder' } } }], steps: [] }],
    },
  }, [{ label: 'Удар', effect: 'удар', args: {} }]);

  it('стоп на третьем уровне платы — реакцию не предлагают', () => {
    const out = play(system, [sheet('а'), sheet('б', { 'запасы.ки.осталось': 0 }, ['щит'])], ['б']);
    expect(out.kind).toBe('done');
  });

  it('запас есть — предлагают', () => {
    const out = play(system, [sheet('а'), sheet('б', { 'запасы.ки.осталось': 1 }, ['щит'])], ['б']);
    expect(out.kind).toBe('paused');
  });
});
