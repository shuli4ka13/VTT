import { describe, it, expect } from 'vitest';
import { act } from '../src/core/act.ts';
import { perform } from '../src/core/perform.ts';
import { emptyJournal } from '../src/core/external.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const sub = (amount: string, field = '@цель.хп') => ({ type: 'apply', target: { expr: field }, direction: 'subtract', value: { expr: amount } });
const add = (amount: string, field: string) => ({ type: 'apply', target: { expr: field }, direction: 'add', value: { expr: amount } });

const ACTOR = { key: 'действующий', kind: 'sheet' };
const TARGETS = { key: 'цели', kind: 'sheet', many: true };
const EACH = { type: 'each', of: 'цели', as: 'цель' };

const button = (steps: unknown[], extra: Record<string, unknown> = {}) =>
  ({ label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS], steps: [EACH, ...steps], ...extra });

function world(effects: Record<string, unknown>, extra: Record<string, unknown> = {}): System {
  return {
    id: 'контракт', name: 'Контракт',
    constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
    tables: {
      лист: { shape: 'single', owner: 'sheet', columns: [
        { key: 'хп', label: 'Хиты', kind: 'number', default: 20, min: 0, max: 30 },
        { key: 'ки', label: 'Ки', kind: 'number', default: 0 },
        { key: 'ловкость', label: 'Ловкость', kind: 'number', default: 0, roll: { die: 'к20' } },
      ] },
      казна: { shape: 'single', owner: 'group', columns: [{ key: 'золото', label: 'Золото', kind: 'number', default: 0 }] },
      приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
    },
    effects,
    ...extra,
  } as unknown as System;
}

const book: Compendium = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] } as Compendium;

const sheet = (id: string, values: Record<string, number> = {}, effects: string[] = [], extra: Partial<Sheet> = {}): Sheet =>
  ({ id, systemId: 'контракт', name: id, values: { хп: 20, ...values }, has: [{ of: 'приём' }], effects: effects.map(effectId => ({ effectId })), ...extra } as Sheet);

const value = (out: { sheets: Sheet[] }, id: string, tag: string) => out.sheets.find(s => s.id === id)!.values[tag];

const strike = (system: System, sheets: Sheet[], to: string, dice: number[], extra: Record<string, unknown> = {}) =>
  perform({ system, compendium: book, clock: null, sheets, die: queue(...dice), ...extra }, { op: 'act', intent: { actionId: 'приём:0', fromId: 'а', toIds: [to] } });

describe('режимы операции', () => {
  const system = world({
    удар: button([sub("кинуть('1к6')")]),
    щит: { label: 'Щит', activation: 'passive', on: [{ on: 'before:удар', if: { expr: '@цель == @носитель' }, confirm: true, steps: [] }] },
  });
  const sheets = [sheet('а'), sheet('б', {}, ['щит'])];

  it('проба: выбранная кость, на вопросы «нет» без паузы', () => {
    const out = strike(system, sheets, 'б', [6], { mode: 'trial' });
    expect(out.kind).toBe('done');
    expect(value(out, 'б', 'хп')).toBe(14);
  });

  it('предпросмотр: новые кости — середина и в журнал не пишутся, известные — из журнала', () => {
    const fresh = strike(system, sheets, 'б', [], { mode: 'preview' });
    expect(value(fresh, 'б', 'хп')).toBe(16);
    expect(fresh.journal.dice).toEqual({});
    const real = strike(system, sheets, 'б', [2]);
    expect(real.kind).toBe('paused');
    const known = strike(system, sheets, 'б', [], { mode: 'preview', journal: real.journal });
    expect(value(known, 'б', 'хп'), 'кость 2 уже в журнале — её и берёт').toBe(18);
  });
});

describe('проба внутри прогона', () => {
  it('вопрос «кости выпали» в теле задаётся до окна «до»: защитник решает по итоговому броску', () => {
    const system = world({
      удар: button([
        { id: 'б_бросок', type: 'roll', die: 'к20', by: { expr: '@цель' } },
        { id: 'б', type: 'check', value: { expr: '@б_бросок' }, versus: { expr: '10' }, continueOn: 'always' },
      ]),
      щит: { label: 'Щит', activation: 'passive', on: [{ on: 'before:удар', if: { expr: '@цель == @носитель' }, confirm: true, steps: [] }] },
      удача: { label: 'Удача', activation: 'passive', on: [{ on: 'seen', if: { expr: '@бросающий == @носитель' }, confirm: true, steps: [{ type: 'roll-plus', value: { expr: '1' } }] }] },
    });
    const sheets = [sheet('а'), sheet('б', {}, ['щит', 'удача'])];
    const first = act({ system, compendium: book, clock: null, sheets, die: queue(7, 7), journal: emptyJournal() }, { actionId: 'приём:0', fromId: 'а', toIds: ['б'] });
    expect(first.kind).toBe('paused');
    if (first.kind !== 'paused') return;
    expect(first.question.window).toBe('seen');
    const second = act({ system, compendium: book, clock: null, sheets, die: queue(), journal: { ...first.journal, answers: { ...first.journal.answers, [first.question.key]: ['удача'] } } }, { actionId: 'приём:0', fromId: 'а', toIds: ['б'] });
    expect(second.kind).toBe('paused');
    if (second.kind !== 'paused') return;
    expect(second.question.window).toBe('target');
    expect(JSON.stringify(second.question.results)).toContain('"total":8');
  });
});

describe('пределы', () => {
  it('вызовы по кругу в теле — ошибка словами, мир не меняется', () => {
    const system = world({
      удар: button([{ type: 'emit', effect: 'пинг', args: { лист: { expr: '@цель' } } }]),
      пинг: { label: 'Пинг', params: [{ key: 'лист', kind: 'sheet' }], steps: [{ type: 'emit', effect: 'понг', args: { лист: { expr: '@лист' } } }] },
      понг: { label: 'Понг', params: [{ key: 'лист', kind: 'sheet' }], steps: [{ type: 'emit', effect: 'пинг', args: { лист: { expr: '@лист' } } }] },
    });
    expect(() => strike(system, [sheet('а'), sheet('б')], 'б', [])).toThrow(/вложены глубже/);
  });

  it('старт боя на двенадцати листах с подпиской каждого не упирается в бюджет', () => {
    const system = world({
      удар: button([]),
      бодрость: { label: 'Бодрость', activation: 'passive', on: [{ on: 'moment:combat-start', steps: [add('1', '@носитель.ки')] }, { on: 'moment:round-start', steps: [add('1', '@носитель.ки')] }] },
    });
    const many = Array.from({ length: 12 }, (_, i) => sheet(`л${i}`, {}, ['бодрость']));
    const out = perform({ system, compendium: book, clock: null, sheets: many, die: queue() }, { op: 'turn', turn: 'start', order: many.map(s => s.id) });
    expect(out.kind).toBe('done');
    expect(many.every(s => value(out as never, s.id, 'ки') === 2)).toBe(true);
  });
});

describe('имена в формулах', () => {
  it('поле листа пишется через имя листа; голое имя поля в эффекте — ошибка словами', () => {
    const system = world({ удар: button([sub('@ки')]) });
    expect(() => strike(system, [sheet('а', { ки: 2 }), sheet('б')], 'б', [])).toThrow(/чьё поле/);
  });

  it('вызванный эффект читает свои входы-листы; подписка — носителя и входы того, на что подписана', () => {
    const system = world({
      удар: button([{ type: 'emit', effect: 'урон', args: { раненый: { expr: '@цель' }, обидчик: { expr: '@действующий' } } }]),
      урон: { label: 'Урон', params: [{ key: 'раненый', kind: 'sheet' }, { key: 'обидчик', kind: 'sheet' }], steps: [sub('@раненый.ки', '@раненый.хп'), sub('@обидчик.ки', '@раненый.хп')] },
      память: { label: 'Память', activation: 'passive', on: [{ on: 'after:урон', if: { expr: '@раненый == @носитель' }, steps: [add('@носитель.ки', '@носитель.хп')] }] },
    });
    const out = strike(system, [sheet('а', { ки: 2 }), sheet('б', { ки: 5 }, ['память'])], 'б', []);
    expect(value(out, 'б', 'хп')).toBe(20 - 5 - 2 + 5);
  });

  it('цель до «для каждого» не названа — ошибка словами', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS], steps: [
        { type: 'check', value: { expr: '@цель.хп' }, versus: { expr: '0' } }, EACH,
      ] },
    });
    expect(() => strike(system, [sheet('а'), sheet('б')], 'б', [])).toThrow(/цель/);
  });
});

describe('бросок вне действия', () => {
  it('подписка «кости выпали» срабатывает на инициативе', () => {
    const system = world({
      удар: button([]),
      шустрый: { label: 'Шустрый', activation: 'passive', on: [{ on: 'seen', if: { expr: '@бросающий == @носитель' }, steps: [{ type: 'roll-plus', value: { expr: '10' } }] }] },
    }, { initiative: { die: 'к20' } });
    const out = perform({ system, compendium: book, clock: null, sheets: [sheet('а'), sheet('б', {}, ['шустрый'])], die: queue(15, 8) }, { op: 'turn', turn: 'start' });
    expect(out.kind).toBe('done');
    expect(out.clock?.order).toEqual(['б', 'а']);
  });
});

describe('операции над листом', () => {
  it('поле группы, вписанное с листа участника, ложится держателю', () => {
    const system = world({ удар: button([]) });
    const sheets = [sheet('а', {}, [], { group: 'банда' } as never), sheet('банда')];
    const out = perform({ system, compendium: book, clock: null, sheets, die: queue() }, { op: 'set', sheetId: 'а', tag: 'золото', value: 7 });
    expect(value(out, 'банда', 'золото')).toBe(7);
    expect(value(out, 'а', 'золото')).toBeUndefined();
  });

  it('группа: сам себе, вложенно и стол — отказ словами', () => {
    const system = world({ удар: button([]) });
    const sheets = [sheet('а'), sheet('б', {}, [], { group: 'а' } as never), sheet('стол')];
    const go = (sheetId: string, group: string) => () => perform({ system, compendium: book, clock: null, sheets, die: queue() }, { op: 'group', sheetId, group });
    expect(go('а', 'а')).toThrow(/самому себе/);
    expect(go('а', 'стол')).toThrow(/стол/);
    expect(go('а', 'б')).toThrow(/группа для других|не вкладываются|сам состоит/);
  });

  it('действие с записью, которой нет на листе, отклоняется', () => {
    const system = world({ удар: button([sub('1')]) });
    const sheets = [{ ...sheet('а'), has: [] } as Sheet, sheet('б')];
    expect(() => strike(system, sheets, 'б', [])).toThrow(/нет действия/);
  });
});

describe('формы эффекта', () => {
  it('стоп до «для каждого» отклоняет всё действие: цена не списана, цели не тронуты', () => {
    const system = world({
      удар: {
        label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS],
        cost: [sub('1', '@действующий.ки')],
        steps: [{ type: 'check', value: { expr: '@действующий.хп' }, versus: { expr: '100' } }, EACH, sub('5')],
      },
    });
    expect(() => strike(system, [sheet('а', { ки: 3 }), sheet('б')], 'б', [])).toThrow(/не состоялось/);
  });

  it('стоп в теле на цели — мягкий конец: сделанное остаётся, «после» срабатывает', () => {
    const system = world({
      удар: button([sub('2'), { type: 'check', value: { expr: '0' }, versus: { expr: '1' } }, sub('10')]),
      отметка: { label: 'Отметка', activation: 'passive', on: [{ on: 'after:удар', if: { expr: '@цель == @носитель' }, steps: [add('1', '@носитель.ки')] }] },
    });
    const out = strike(system, [sheet('а'), sheet('б', {}, ['отметка'])], 'б', []);
    expect(value(out, 'б', 'хп')).toBe(18);
    expect(value(out, 'б', 'ки')).toBe(1);
  });

  it('ноль целей: шаги до цикла один раз, «завершено» случается, «до» и «после» — нет', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS], steps: [add('1', '@действующий.ки'), EACH, sub('5')] },
      итог: { label: 'Итог', activation: 'passive', on: [
        { on: 'done:удар', if: { expr: '@действующий == @носитель' }, steps: [add('10', '@носитель.ки')] },
        { on: 'before:удар', steps: [add('100', '@носитель.ки')] },
      ] },
    });
    const out = perform({ system, compendium: book, clock: null, sheets: [sheet('а', {}, ['итог'])], die: queue() }, { op: 'act', intent: { actionId: 'приём:0', fromId: 'а', toIds: [] } });
    expect(value(out, 'а', 'ки')).toBe(11);
  });

  it('подписку слышат все носители: третий лист отвечает на удар по соседу', () => {
    const system = world({
      удар: button([sub('3')]),
      аура: { label: 'Аура', activation: 'passive', on: [{ on: 'after:удар', if: { expr: '@цель != @носитель' }, steps: [add('1', '@цель.хп')] }] },
    });
    const out = strike(system, [sheet('а'), sheet('б'), sheet('в', {}, ['аура'])], 'б', []);
    expect(value(out, 'б', 'хп')).toBe(18);
  });

  it('висящий эффект хранит входы: наложенный со сложностью читает её в своей подписке', () => {
    const system = world({
      удар: button([{ type: 'status', effect: 'метка', to: { expr: '@цель' }, args: { сила: { expr: '4' } } }]),
      метка: { label: 'Метка', activation: 'passive', params: [{ key: 'сила', kind: 'number', optional: true }], on: [
        { on: 'moment:turn-end', if: { expr: '@ходит == @носитель' }, steps: [sub('@сила', '@носитель.хп')] },
      ] },
    });
    const marked = strike(system, [sheet('а'), sheet('б')], 'б', []);
    expect(marked.sheets.find(s => s.id === 'б')!.effects).toEqual([{ effectId: 'метка', args: { сила: 4 } }]);
    const clock = { round: 1, order: ['б', 'а'], active: 'б' };
    const out = perform({ system, compendium: book, clock, sheets: marked.sheets, die: queue() }, { op: 'turn', turn: 'next' });
    expect(value(out, 'б', 'хп')).toBe(16);
  });
});

describe('по ревью постройки', () => {
  it('подписка на кнопку видит её входы: и «до», и «после», и «завершено»', () => {
    const system = world({
      удар: { ...button([sub('@бонус')]), params: [ACTOR, TARGETS, { key: 'бонус', kind: 'number' }] },
      слух: { label: 'Слух', activation: 'passive', on: [
        { on: 'before:удар', if: { expr: '@бонус > 2' }, steps: [add('1', '@носитель.ки')] },
        { on: 'after:удар', if: { expr: '@бонус > 2' }, steps: [add('10', '@носитель.ки')] },
        { on: 'done:удар', if: { expr: '@бонус > 2' }, steps: [add('100', '@носитель.ки')] },
      ] },
    }, {});
    (system.tables!.приём as { bindings: unknown[] }).bindings = [{ label: 'Удар', effect: 'удар', args: { бонус: { expr: '3' } } }];
    const out = strike(system, [sheet('а', {}, ['слух']), sheet('б')], 'б', []);
    expect(value(out, 'б', 'хп')).toBe(17);
    expect(value(out, 'а', 'ки')).toBe(111);
  });

  it('автоматическая подписка «до» видит пробу тела', () => {
    const system = world({
      удар: button([{ id: 'п', type: 'check', value: { expr: '5' }, versus: { expr: '1' } }, sub('1')]),
      чутьё: { label: 'Чутьё', activation: 'passive', on: [{ on: 'before:удар', if: { expr: 'все(@цель == @носитель, @п.success)' }, steps: [add('1', '@носитель.ки')] }] },
    });
    const out = strike(system, [sheet('а'), sheet('б', {}, ['чутьё'])], 'б', []);
    expect(value(out, 'б', 'ки')).toBe(1);
  });

  it('бюджет считается на одну цепочку: двенадцать листов с вызовами в начале раунда не обрываются', () => {
    const system = world({
      удар: button([]),
      плюс: { label: 'Плюс', params: [{ key: 'лист', kind: 'sheet' }], steps: [add('1', '@лист.ки')] },
      реген: { label: 'Реген', activation: 'passive', on: [{ on: 'moment:round-start', steps: [
        { type: 'emit', effect: 'плюс', args: { лист: { expr: '@носитель' } } },
        { type: 'emit', effect: 'плюс', args: { лист: { expr: '@носитель' } } },
        { type: 'emit', effect: 'плюс', args: { лист: { expr: '@носитель' } } },
      ] }] },
    });
    const many = Array.from({ length: 12 }, (_, i) => sheet(`л${i}`, {}, ['реген']));
    const out = perform({ system, compendium: book, clock: null, sheets: many, die: queue() }, { op: 'turn', turn: 'start', order: many.map(s => s.id) });
    expect(many.every(s => value(out as never, s.id, 'ки') === 3)).toBe(true);
  });

  it('держание не утекает во вложенный вызов: наложенное «Уроном» не держится', () => {
    const system = world({
      удар: { ...button([{ type: 'emit', effect: 'урон', args: { лист: { expr: '@цель' } } }]), bond: { effect: 'держу', by: 'действующий' } },
      урон: { label: 'Урон', params: [{ key: 'лист', kind: 'sheet' }], steps: [{ type: 'status', effect: 'шрам', to: { expr: '@лист' } }] },
      держу: { label: 'Держу', activation: 'passive' },
      шрам: { label: 'Шрам', activation: 'passive' },
    });
    const out = strike(system, [sheet('а'), sheet('б')], 'б', []);
    expect(out.sheets.find(s => s.id === 'б')!.effects).toEqual([{ effectId: 'шрам' }]);
  });

  it('статические метки эффекта входят в метки вызова: правка по метке срабатывает', () => {
    const system = world({
      удар: button([{ type: 'emit', effect: 'урон', args: { лист: { expr: '@цель' }, сколько: { expr: '10' } } }]),
      урон: { label: 'Урон', tags: ['огонь'], params: [{ key: 'лист', kind: 'sheet' }, { key: 'сколько', kind: 'number', role: 'amount' }], steps: [sub('@сколько', '@лист.хп')] },
      стойкость: { label: 'Стойкость', activation: 'passive', modifiers: [{ kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0.5' }, anyTags: ['огонь'], if: { expr: '@лист == @носитель' } }] },
    });
    const out = strike(system, [sheet('а'), sheet('б', {}, ['стойкость'])], 'б', []);
    expect(value(out, 'б', 'хп')).toBe(15);
  });

  it('проверка конструктора ловит формулу, которая не разбирается', () => {
    const system = world({
      удар: button([]),
      слух: { label: 'Слух', activation: 'passive', on: [{ on: 'after:удар', if: { expr: '@цель == @носитель и да' }, steps: [] }] },
    });
    expect(errorsOf(lintSystem(system)).map(p => p.text).join('\n')).toMatch(/не разбирается/);
  });
});


describe('правка висящего видит его входы', () => {
  const system = world({
    удар: button([{ type: 'emit', effect: 'урон', args: { лист: { expr: '@цель' }, источник: { expr: '@действующий' }, сколько: { expr: '2' } } }]),
    урон: { label: 'Урон', params: [{ key: 'лист', kind: 'sheet' }, { key: 'источник', kind: 'sheet' }, { key: 'сколько', kind: 'number', role: 'amount' }], steps: [sub('@сколько', '@лист.хп')] },
    метка: {
      label: 'Метка охотника', activation: 'passive',
      params: [{ key: 'охотник', kind: 'sheet' }, { key: 'прибавка', kind: 'number' }],
      modifiers: [{ kind: 'edit', call: 'урон', param: 'сколько', op: 'add', value: { expr: '@прибавка' }, if: { expr: 'все(@лист == @носитель, @источник == @охотник)' } }],
    },
  });
  const marked = (hunter: string) => sheet('б', {}, [], { effects: [{ effectId: 'метка', args: { охотник: hunter, прибавка: 3 } }] } as never);

  it('бьёт охотник — прибавка из входа', () => {
    expect(value(strike(system, [sheet('а'), marked('а')], 'б', []), 'б', 'хп')).toBe(15);
  });

  it('бьёт другой — правка молчит', () => {
    expect(value(strike(system, [sheet('а'), marked('в')], 'б', []), 'б', 'хп')).toBe(18);
  });

  it('проверка системы знает имена входов в правке', () => {
    expect(errorsOf(lintSystem(system)).map(p => p.text)).toEqual([]);
  });
});
