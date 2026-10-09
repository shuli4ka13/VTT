import { describe, it, expect } from 'vitest';
import { act } from '../src/core/act.ts';
import { emptyJournal } from '../src/core/external.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const hit = (amount: string, field = '@цель.хп') => ({ type: 'apply', target: { expr: field }, direction: 'subtract', value: { expr: amount } });

const ACTOR = { key: 'действующий', kind: 'sheet' };
const TARGETS = { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } };
const EACH = { type: 'each', of: 'цели' };

const attackRoll = {
  label: 'Бросок атаки',
  params: [{ key: 'кто', kind: 'sheet' }, { key: 'против', kind: 'sheet' }, { key: 'бонус', kind: 'number', default: 0 }],
  returns: [
    { key: 'попал', label: 'попал', kind: 'boolean', no: 'промах', expr: { expr: '@проверка.success' } },
    { key: 'выпало', label: 'на костях', kind: 'number', expr: { expr: '@бросок.natural' } },
  ],
  steps: [
    { id: 'бросок', type: 'roll', die: 'к20', bonus: { expr: '@бросок_бонус' }, by: { expr: '@кто' }, against: { expr: '@против' }, tags: ['атака'] },
    { id: 'проверка', type: 'check', value: { expr: '@бросок' }, versus: { expr: '@против.кд' } },
  ],
};
attackRoll.steps[0]!.bonus = { expr: '@бонус' };

const strike = (steps: unknown[] = [
  { id: 'атака', type: 'emit', effect: 'бросок_атаки', args: { кто: { expr: '@действующий' }, против: { expr: '@цель' }, бонус: { expr: '5' } } },
  { type: 'branch', if: { expr: '@атака.попал' } }, hit('3'), { type: 'end' },
]) => ({ label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS], steps: [EACH, ...steps] });

const world = (effects: Record<string, unknown>): System => ({
  id: 'библиотека', name: 'Библиотека',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [
      { key: 'хп', label: 'Хиты', kind: 'number', default: 20 },
      { key: 'кд', label: 'Класс брони', kind: 'number', default: 15 },
      { key: 'щит', label: 'Щитов', kind: 'number', default: 0 },
    ] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  roll_edits: { помеха: { label: 'помеха', ops: [{ op: 'addDie', count: 1 }, { op: 'keepWorst', n: 1 }] } },
  effects: { бросок_атаки: attackRoll, ...effects },
} as unknown as System);

const book: Compendium = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] } as Compendium;
const sheet = (id: string, values: Record<string, number> = {}, effects: string[] = []): Sheet =>
  ({ id, systemId: 'библиотека', name: id, values: { хп: 20, ...values }, has: [{ of: 'приём' }], effects: effects.map(effectId => ({ effectId })) } as Sheet);
const hp = (out: { sheets: Sheet[] }, id: string) => out.sheets.find(s => s.id === id)!.values.хп;

const play = (system: System, sheets: Sheet[], dice: number[], extra: Record<string, unknown> = {}) =>
  act({ system, compendium: book, clock: null, sheets, die: queue(...dice), journal: emptyJournal() },
    { actionId: 'приём:0', fromId: 'а', toIds: ['б'], ...extra }) as { kind: string; sheets: Sheet[] };

describe('готовый блок отдаёт итоги («Что отдаёт»)', () => {
  it('тот, кто вызвал, читает итог вызова: попал — урон, промах — нет', () => {
    const system = world({ удар: strike() });
    expect(hp(play(system, [sheet('а'), sheet('б')], [12]), 'б'), '12 + 5 ≥ 15').toBe(17);
    expect(hp(play(system, [sheet('а'), sheet('б')], [3]), 'б'), '3 + 5 < 15').toBe(20);
  });

  it('«Стоп» внутри блока — итоги пусты, а не ошибка «шаг ещё не прошёл»', () => {
    const stopping = { ...attackRoll, steps: [{ type: 'stop' }, ...attackRoll.steps] };
    const system = world({
      бросок_атаки: stopping,
      удар: strike([
        { id: 'атака', type: 'emit', effect: 'бросок_атаки', args: { кто: { expr: '@действующий' }, против: { expr: '@цель' } } },
        { type: 'branch', if: { expr: 'пусто(@атака.попал)' } }, hit('7'), { type: 'end' },
      ]),
    });
    expect(hp(play(system, [sheet('а'), sheet('б')], []), 'б')).toBe(13);
  });

  it('итог шага в невзятой ветке — пусто', () => {
    const branchy = {
      ...attackRoll,
      returns: [{ key: 'попал', label: 'попал', kind: 'boolean', expr: { expr: 'или(@проверка.success, нет)' } }],
      steps: [{ type: 'branch', if: { expr: 'нет' } }, ...attackRoll.steps, { type: 'end' }],
    };
    const system = world({ бросок_атаки: branchy, удар: strike() });
    expect(hp(play(system, [sheet('а'), sheet('б')], []), 'б')).toBe(20);
  });
});

describe('бросок внутри готового блока остаётся броском того, кто бросает', () => {
  it('заявка стола доходит до броска внутри вызова', () => {
    const system = world({ удар: strike() });
    const claimed = play(system, [sheet('а'), sheet('б')], [18, 4], { claims: { а: ['помеха'] } });
    expect(hp(claimed, 'б'), 'помеха: худшая из 18 и 4 → 9 < 15').toBe(20);
  });

  it('«увидев кости» срабатывает на броске внутри вызова', () => {
    const system = world({
      удар: strike(),
      удача: { label: 'Удача', activation: 'passive', on: [{ on: 'seen', if: { expr: '@бросающий == @носитель' }, steps: [{ type: 'roll-plus', value: { expr: '10' } }] }] },
    });
    expect(hp(play(system, [sheet('а', {}, ['удача']), sheet('б')], [3]), 'б'), '3 + 5 + 10 ≥ 15').toBe(17);
  });

  it('вопрос «увидев кости» задаётся игроку и для броска внутри вызова', () => {
    const system = world({
      удар: strike(),
      удача: { label: 'Удача', activation: 'passive', on: [{ on: 'seen', if: { expr: '@бросающий == @носитель' }, confirm: true, steps: [{ type: 'roll-plus', value: { expr: '10' } }] }] },
    });
    const first = act({ system, compendium: book, clock: null, sheets: [sheet('а', {}, ['удача']), sheet('б')], die: queue(3), journal: emptyJournal() },
      { actionId: 'приём:0', fromId: 'а', toIds: ['б'] });
    expect(first.kind).toBe('paused');
    if (first.kind !== 'paused') return;
    expect(first.question.window).toBe('seen');
  });

  it('подписка «до удара» видит итог готового блока из пробы тела (Щит)', () => {
    const system = world({
      удар: strike(),
      щит: { label: 'Щит', activation: 'passive', on: [{ on: 'before:удар', if: { expr: 'все(@цель == @носитель, @атака.попал)' }, steps: [{ type: 'apply', target: { expr: '@носитель.щит' }, direction: 'add', value: { expr: '1' } }] }] },
    });
    const out = play(system, [sheet('а'), sheet('б', {}, ['щит'])], [12, 12]);
    expect(out.sheets.find(s => s.id === 'б')!.values.щит).toBe(1);
  });
});

describe('журнал видит бросок и проверку внутри готового блока', () => {
  it('строка хода называет бросок по метке и исход проверки', () => {
    const system = world({ удар: strike() });
    const out = play(system, [sheet('а'), sheet('б')], [12]) as unknown as { log: string[] };
    const text = out.log.join('\n');
    expect(text).toMatch(/Бросок \(атака\): \[12\] \+ .*= 17/u);
    expect(text).toMatch(/Проверка \(атака\): 17 против Класс брони: 15/u);
  });
});

describe('«Стоп» во вложенном вызове из цены — отказ всего действия', () => {
  it('цена → функция → функция со «Стопом»: действие не состоялось, костей не бросали', () => {
    const system = world({
      удар: { ...strike(), cost: [{ type: 'emit', effect: 'плата', args: { лист: { expr: '@действующий' } } }] },
      плата: { label: 'Плата', params: [{ key: 'лист', kind: 'sheet' }], steps: [{ type: 'emit', effect: 'ячейка', args: { лист: { expr: '@лист' } } }] },
      ячейка: { label: 'Ячейка', params: [{ key: 'лист', kind: 'sheet' }], steps: [
        { type: 'branch', if: { expr: '@лист.щит < 1' } }, { type: 'stop', note: { expr: '"нет ячейки"' } }, { type: 'end' },
      ] },
    });
    expect(() => play(system, [sheet('а'), sheet('б')], [])).toThrow(/не состоялось: нет ячейки/);
  });
});

describe('линт итогов готового блока', () => {
  it('опечатка в итоге вызова — ошибка словами, верный итог — без ошибок', async () => {
    const { lintSystem, errorsOf } = await import('../src/model/lint.ts');
    const typo = world({ удар: strike([
      { id: 'атака', type: 'emit', effect: 'бросок_атаки', args: { кто: { expr: '@действующий' }, против: { expr: '@цель' } } },
      { type: 'branch', if: { expr: '@атака.попла' } }, hit('3'), { type: 'end' },
    ]) });
    expect(errorsOf(lintSystem(typo, book)).map(p => p.text)).toContain('у «Бросок атаки» нет итога «попла»');
    expect(errorsOf(lintSystem(world({ удар: strike() }), book)).map(p => p.text).filter(t => t.includes('нет итога'))).toEqual([]);
  });
});

describe('ревью: линт и журнал готовых блоков', () => {
  it('опечатка итога в подписке на эффект с вызовом — ошибка', async () => {
    const { lintSystem, errorsOf } = await import('../src/model/lint.ts');
    const system = world({
      удар: strike(),
      щит: { label: 'Щит', activation: 'passive', on: [{ on: 'before:удар', if: { expr: '@атака.попла' }, steps: [] }] },
    });
    expect(errorsOf(lintSystem(system, book)).map(p => p.text)).toContain('у «Бросок атаки» нет итога «попла»');
  });

  it('вызов функции с величиной 0 пишется с числом, без величины — без', () => {
    const system = world({
      урон: { label: 'Урон', params: [{ key: 'лист', kind: 'sheet' }, { key: 'сколько', kind: 'number', role: 'amount' }], steps: [hit('@сколько', '@лист.хп')] },
      удар: strike([
        { id: 'атака', type: 'emit', effect: 'бросок_атаки', args: { кто: { expr: '@действующий' }, против: { expr: '@цель' } } },
        { type: 'emit', effect: 'урон', args: { лист: { expr: '@цель' }, сколько: { expr: '0' } } },
      ]),
    });
    const text = (play(system, [sheet('а'), sheet('б')], [10]) as unknown as { log: string[] }).log.join('\n');
    expect(text).toContain('зовёт «Урон»: 0');
    expect(text).toMatch(/зовёт «Бросок атаки»(?!:)/u);
  });
});
