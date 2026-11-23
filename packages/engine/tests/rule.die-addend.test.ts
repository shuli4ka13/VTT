import { group, test, eq } from './harness.ts';
import { act } from '../src/core/act.ts';
import { emptyJournal } from '../src/core/external.ts';
import { lintSystem } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const ACTOR = { key: 'действующий', kind: 'sheet' };
const TARGETS = { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } };
const mine = '@roller == @holder';

const world = (attack: Record<string, unknown>, effects: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): System => ({
  id: 'к', name: 'к',
  tables: {
    лист: { shape: 'single', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }, { key: 'кд', label: 'КД', kind: 'number', default: 10 }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
  constants: {
    к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] },
    к4: { label: 'к4', kind: 'die', dice: [{ count: 1, sides: 4 }] },
  },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS],
      steps: [
        { type: 'each', of: 'цели' },
        { id: 'бросок', type: 'roll', die: 'к20', by: { expr: '@действующий' }, ...attack },
        { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '@бросок' } },
      ],
    },
    ...effects,
  },
  ...extra,
} as unknown as System);

const book = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] } as Compendium;
const sheet = (id: string, effects: string[] = []): Sheet =>
  ({ id, systemId: 'к', name: id, values: {}, has: [{ of: 'приём' }], effects: effects.map(effectId => ({ effectId })) } as unknown as Sheet);

const dealt = (system: System, dice: number[], effects: string[] = []): number => {
  const out = act({ system, compendium: book, clock: null, sheets: [sheet('а', effects), sheet('б')], die: queue(...dice), journal: emptyJournal() }, { actionId: 'приём:0', fromId: 'а', toIds: ['б'] });
  if (out.kind !== 'done') throw new Error('действие спросило');
  return 20 - Number(out.sheets.find(one => one.id === 'б')!.values.хп ?? 20);
};

group('«Бросок» оставляет лучшие или худшие', () => {
  test('бросить три к6, оставить две лучшие', () => {
    eq(dealt(world({ die: '1d6', count: { expr: '3' }, keep: { expr: '2' } }), [5, 1, 6]), 11);
  });

  test('оставить худшую', () => {
    eq(dealt(world({ die: '1d6', count: { expr: '3' }, keep: { expr: '1' }, keepWorst: true }), [5, 2, 6]), 2);
  });

  test('«Проблемы»: «оставить» без кости', () => {
    const sys = world({ die: undefined, fixed: { expr: '3' }, keep: { expr: '1' } });
    eq(lintSystem(sys).some(one => one.text.includes('«оставить» — только у броска кости')), true);
  });
});

group('кость прибавки — без «кинуть»', () => {
  test('«увидев кости → прибавить» костью из «Костей» и вычесть', () => {
    const plus = { label: 'Благо', activation: 'passive', on: [{ on: 'seen', if: { expr: mine }, steps: [{ type: 'roll-plus', die: 'к4' }] }] };
    const minus = { label: 'Порча', activation: 'passive', on: [{ on: 'seen', if: { expr: mine }, steps: [{ type: 'roll-plus', die: '1d4', count: { expr: '2' }, minus: true }] }] };
    eq(dealt(world({}, { благо: plus }), [10, 3], ['благо']), 13);
    eq(dealt(world({}, { порча: minus }), [10, 3, 1], ['порча']), 6);
  });

  test('правка «Бросок → прибавка» костью', () => {
    const blessed = { label: 'Благословлён', activation: 'passive', modifiers: [{ kind: 'edit', call: 'roll', param: 'bonus', op: 'add', die: '1d4', if: { expr: mine } }] };
    const baned = { label: 'Порча', activation: 'passive', modifiers: [{ kind: 'edit', call: 'roll', param: 'bonus', op: 'add', die: 'к4', minus: true, if: { expr: mine } }] };
    eq(dealt(world({}, { благо: blessed }), [10, 4], ['благо']), 14);
    eq(dealt(world({}, { порча: baned }), [10, 4], ['порча']), 6);
  });

  test('слово правки броска «прибавить» костью', () => {
    const sys = world({ claims: undefined }, {
      дар: { label: 'Дар', activation: 'passive', modifiers: [{ kind: 'edit', call: 'roll', param: 'edits', op: 'add', edit: 'advantage', if: { expr: mine } }] },
    }, { roll_edits: { advantage: { label: 'Преимущество', ops: [{ op: 'plus', die: '1d6' }] } } });
    eq(dealt(sys, [10, 5], ['дар']), 15);
  });

  test('«Проблемы»: прибавка костью без числа — не ошибка', () => {
    const blessed = { label: 'Благословлён', activation: 'passive', modifiers: [{ kind: 'edit', call: 'roll', param: 'bonus', op: 'add', die: '1d4' }] };
    eq(lintSystem(world({}, { благо: blessed })).some(one => one.text.includes('не задано, на сколько')), false);
  });
});
