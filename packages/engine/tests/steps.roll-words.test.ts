import { group, test, eq } from './harness.ts';
import { exchange } from './play.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const word = (edit: string) => ({ label: edit, activation: 'passive', duration: { kind: 'permanent' }, modifiers: [{ kind: 'edit', call: 'roll', param: 'edits', edit, if: { expr: '@roller == @holder' } }] });

const system = {
  id: 'с', name: 'с',
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  roll_edits: {
    advantage: { label: 'Преимущество', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }], cancels: ['disadvantage'] },
    disadvantage: { label: 'Помеха', ops: [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }], cancels: ['advantage'] },
  },
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'счёт', label: 'Счёт', kind: 'number' }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Бросок', effect: 'бросок', args: {} }] },
  },
  effects: {
    бросок: {
      label: 'Бросок', activation: 'manual', params: [{ key: 'действующий', kind: 'sheet' }],
      steps: [
        { id: 'к', type: 'roll', die: 'к20', by: { expr: '@действующий' } },
        { type: 'apply', target: { expr: '@действующий.счёт' }, direction: 'set', value: { expr: 'if(has(@к.words, "advantage"), 1, 0) + if(has(@к.words, "disadvantage"), 10, 0)' } },
      ],
    },
    благо: word('advantage'),
    беда: word('disadvantage'),
  },
} as unknown as System;

const book = { records: [{ id: 'приём', table: 'приём', label: 'Бросок', cells: {} }] } as unknown as Compendium;
const me = (effects: string[]): Sheet => ({ id: 'я', systemId: 'с', name: 'я', values: { счёт: 0 }, has: [{ of: 'приём' }], effects: effects.map(effectId => ({ effectId })) }) as unknown as Sheet;
const score = (effects: string[]): unknown => exchange({ system, compendium: book, die: () => 7, sheets: [me(effects)], actionId: 'приём:0', fromId: 'я', toIds: [] }).sheets[0]!.values.счёт;

group('бросок отдаёт слова правок, которые сработали', () => {
  test('преимущество и помеха видны формуле по ключу слова', () => {
    eq(score([]), 0);
    eq(score(['благо']), 1);
    eq(score(['беда']), 10);
  });

  test('погашенные друг другом слова в итог не попадают', () => {
    eq(score(['благо', 'беда']), 0);
  });
});
