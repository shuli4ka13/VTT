import { group, test, eq, ok } from './harness.ts';
import { lintSystem } from '../src/model/lint.ts';
import type { System } from '../src/model/types.ts';

const ACTOR = { key: 'действующий', label: 'Кто действует', kind: 'sheet' };
const TARGETS = { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' } };

const strike = (extra: Record<string, unknown> = {}, tags: unknown[] = ['атака']) => ({
  label: 'Удар', activation: 'manual', tags: ['атака'],
  params: [ACTOR, TARGETS, { key: 'способ', label: 'Способ', kind: 'choice', from: 'дальность', optional: true }, { key: 'рядом', label: 'Рядом', kind: 'boolean', optional: true }],
  steps: [{ type: 'each', of: 'цели' }, { id: 'бросок', type: 'roll', die: 'к20', by: { expr: '@действующий' }, tags }, { id: 'проверка', type: 'check', value: { expr: '@бросок' }, versus: { expr: '10' } }],
  ...extra,
});

const system = (effects: Record<string, unknown>, contract: Record<string, unknown>): System => ({
  id: 'форма', name: 'Форма',
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }] },
    дальность: { label: 'Дальность', key: 'word', rows: [{ value: 'ближний' }, { value: 'дальний' }] },
    броски: { label: 'Броски', key: 'word', rows: [{ value: 'атака' }, { value: 'вплотную' }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
  tags: { атака: { label: 'Атака', inputs: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true }], each: 'цель', ...contract } },
  effects,
}) as unknown as System;

const texts = (s: System, part: string): string[] => lintSystem(s).filter(problem => problem.text.includes(part)).map(problem => `${problem.level}: ${problem.text}`);

group('договор метки: выходы — итоги эффекта с видом', () => {
  const outputs = { outputs: [{ key: 'попал', kind: 'boolean' }] };
  const hit = { key: 'попал', label: 'попал', kind: 'boolean', expr: { expr: '@проверка.success' } };

  test('у эффекта с меткой нет итога договора — ошибка; есть итог того же вида — чисто', () => {
    eq(texts(system({ удар: strike() }, outputs), 'требует итог').length, 1);
    eq(texts(system({ удар: strike({ returns: [hit] }) }, outputs), 'требует итог').join(' | '), '');
  });

  test('итог с тем же ключом, но другого вида — ошибка', () => {
    const found = texts(system({ удар: strike({ returns: [{ ...hit, kind: 'number' }] }) }, outputs), 'требует итог');
    ok(found[0]?.startsWith('error: метка «Атака» требует итог «попал» (да / нет)'), found.join(' | '));
  });

  test('подписка на метку читает выход по имени: «до» и «после» — без «нет ни входа, ни шага», шага чужого эффекта она не видит', () => {
    const listener = (on: string, expr: string) => ({ label: 'Щит', activation: 'passive', on: [{ on, if: { expr }, steps: [] }] });
    const make = (on: string, expr: string) => system({ удар: strike({ returns: [hit] }), щит: listener(on, expr) }, outputs);
    eq(texts(make('before:атака', '@цель == @holder and @попал'), 'нет ни входа').join(' | '), '');
    eq(texts(make('after:атака', '@цель == @holder and @попал'), 'нет ни входа').join(' | '), '');
    eq(texts(make('after:атака', '@цель == @holder and @проверка.success'), 'выше по цепочке нет').length, 1);
  });
});

group('договор метки: признаки броска', () => {
  const traits = { traits: [{ key: 'способ', from: 'дальность' }, { key: 'вплотную' }], said: { способ: 'способ' } };

  test('бросок с меткой договора без признаков — по ошибке на признак, с адресом шага', () => {
    const found = lintSystem(system({ удар: strike() }, traits)).filter(problem => problem.text.includes('не несёт признак'));
    eq(found.length, 2);
    ok(found.every(problem => problem.level === 'error' && (problem.where as { step?: number }).step === 1));
    ok(found.some(problem => problem.text.includes('«способ»')) && found.some(problem => problem.text.includes('«вплотную»')), found.map(p => p.text).join(' | '));
  });

  test('признаки формулой метки — чисто: выбор из таблицы и «если(…, "вплотную", "")»', () => {
    const tags = ['атака', { expr: '@способ' }, { expr: 'if(@рядом == true, "вплотную", "")' }];
    eq(texts(system({ удар: strike({}, tags) }, traits), 'не несёт признак').join(' | '), '');
  });

  test('формулу метки не развернуть — система «открыта», замечаний нет', () => {
    eq(texts(system({ удар: strike({}, ['атака', { expr: '@действующий.хп' }]) }, traits), 'не несёт признак').join(' | '), '');
  });
});

group('«Проблемы»: подписка по имени эффекта', () => {
  const heard = (on: string) => system({
    удар: strike(),
    эхо: { label: 'Эхо', activation: 'passive', on: [{ on, if: { expr: '@действующий == @holder' }, steps: [] }] },
  }, {});

  test('слушать чужой эффект по имени — замечание, не ошибка', () => {
    const found = texts(heard('after:удар'), 'по имени');
    eq(found.length, 1);
    ok(found[0]!.startsWith('warn: подписка слушает эффект «Удар» по имени'), found[0]);
  });

  test('слушать метку и слушать самого себя — без замечаний', () => {
    eq(texts(heard('after:атака'), 'по имени').join(' | '), '');
    const self = system({ удар: strike({ on: [{ on: 'after:удар', steps: [] }] }) }, {});
    eq(texts(self, 'по имени').join(' | '), '');
  });
});
