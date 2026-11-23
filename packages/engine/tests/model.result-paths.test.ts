import { group, test, eq, deepEq } from './harness.ts';
import { lintSystem } from '../src/model/lint.ts';
import type { System } from '../src/model/types.ts';

const ACTOR = { key: 'действующий', label: 'Кто действует', kind: 'sheet' };
const TARGETS = { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' } };

const system = (value: string, rule: Record<string, unknown> = {}) => ({
  id: 'к', name: 'к',
  tables: { лист: { shape: 'single', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }, { key: 'навык', label: 'Навык', kind: 'number', default: 1 }] } },
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  rolls: { проверка: { label: 'Проверка', die: 'к20', number: 'bonus', fields: [{ table: 'лист', column: 'навык' }], ...rule } },
  effects: { удар: { label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS], steps: [
    { type: 'each', of: 'цели' },
    { id: 'бросок', type: 'roll', die: 'к20', by: { expr: '@действующий' } },
    { id: 'итог', type: 'check', value: { expr: '@бросок' }, versus: { expr: '10' } },
    { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: value } },
  ] } },
}) as unknown as System;

const errors = (sys: System): string[] => lintSystem(sys).filter(one => one.level === 'error').map(one => one.text);

group('«Проблемы» ловят опечатку в итоге шага', () => {
  test('после «Броска» и «Проверки» — имя, которого у шага нет', () => {
    eq(errors(system('@бросок.natual')).includes('у шага «бросок» нет итога «natual» — после «бросок» выберите итог из списка'), true);
    eq(errors(system('if(@итог.sucess, 5, 0)')).some(text => text.includes('у шага «итог» нет итога «sucess»')), true);
  });

  test('настоящие итоги — без находок', () => {
    for (const ok of ['@бросок.natural', '@бросок.total', 'count(@бросок.dice.rolls, 6)', '@итог.margin', 'if(@итог.success, @итог.total, 0)']) {
      deepEq(errors(system(ok)), [], ok);
    }
  });

  test('в формулах правила броска — то же для @бросок', () => {
    eq(errors(system('1', { success: { expr: '@roll.natral == 20' } })).some(text => text.includes('бросок «Проверка»: у броска нет итога «natral»')), true);
    deepEq(errors(system('1', { degrees: [{ label: 'крит', if: { expr: '@roll.natural == 20' } }] })), []);
  });
});
