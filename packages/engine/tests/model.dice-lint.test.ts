import { group, test, eq } from './harness.ts';
import { lintSystem } from '../src/model/lint.ts';
import type { System } from '../src/model/types.ts';

const ACTOR = { key: 'действующий', kind: 'sheet' };
const TARGETS = { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } };

const system = (extra: { steps?: unknown[]; modifiers?: unknown[]; columns?: unknown[]; rule?: Record<string, unknown> } = {}) => ({
  id: 'к', name: 'к',
  tables: { лист: { shape: 'single', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }, { key: 'навык', label: 'Навык', kind: 'number', default: 1 }, ...(extra.columns ?? [])] } },
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  rolls: { проверка: { label: 'Проверка', die: 'к20', number: 'bonus', fields: [{ table: 'лист', column: 'навык' }], ...(extra.rule ?? {}) } },
  effects: {
    удар: { label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS], steps: [
      { type: 'each', of: 'цели' },
      ...(extra.steps ?? [{ type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '1' } }]),
    ] },
    благо: { label: 'Благо', activation: 'passive', modifiers: extra.modifiers ?? [] },
  },
}) as unknown as System;

const errors = (sys: System): string[] => lintSystem(sys).filter(one => one.level === 'error').map(one => one.text);
const dice = (texts: string[]): string[] => texts.filter(text => /Бросок|Сколько|кости не бросают/.test(text));

group('«Проблемы» про кости в формулах', () => {
  test('«кинуть» в шаге — одна находка, без второй про «кость как число»', () => {
    const found = dice(errors(system({ steps: [{ type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: 'кинуть(@к20)' } }] })));
    eq(found.length, 1);
  });

  test('«кинуть» в формуле поля листа тоже ловится', () => {
    eq(dice(errors(system({ columns: [{ key: 'удача', label: 'Удача', expr: { expr: 'кинуть(к6)' } }] }))).length, 1);
  });

  test('кость прибавки у правки: имя, которого нет в «Костях», и опечатка во входе', () => {
    const named = errors(system({ modifiers: [{ kind: 'edit', call: 'roll', param: 'bonus', op: 'add', die: 'нет_такой' }] }));
    eq(named.some(text => text.includes('«нет_такой»')), true);
    const typo = errors(system({ modifiers: [{ kind: 'edit', call: 'roll', param: 'bonus', op: 'add', die: { expr: '@носитель.нет_поля' } }] }));
    eq(typo.some(text => text.includes('нет_поля')), true);
    eq(errors(system({ modifiers: [{ kind: 'edit', call: 'roll', param: 'bonus', op: 'add', die: { expr: '1к4' } }] })).some(text => text.includes('1к4')), false);
  });

  test('в правиле броска «@бросок.margin» — опечатка: степени правила зовутся @степени', () => {
    eq(errors(system({ rule: { success: { expr: '@бросок.margin > 0' } } })).some(text => text.includes('нет итога «margin»')), true);
  });
});
