import { group, test, eq, deepEq, throws } from './harness.ts';
import { newPass } from '../src/engine/calc.ts';
import { editNumber, resolveRoll, incomingRollModifiers } from '../src/engine/modifiers.ts';
import type { System, Sheet, Modifier } from '../src/model/types.ts';

const world = (modifiers: unknown[]): System => ({
  id: 'п', name: 'п',
  tables: {
    лист: { shape: 'single', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 10 }, { key: 'ранен', label: 'Ранен', kind: 'boolean' }] },
    типы: { label: 'Типы урона', key: 'word', rows: [{ value: 'огонь', label: 'огонь' }, { value: 'холод', label: 'холод' }] },
  },
  roll_edits: {
    advantage: { label: 'Преимущество', ops: [{ op: 'keep', best: 1 }], canceledBy: 'disadvantage' },
    disadvantage: { label: 'Помеха', ops: [{ op: 'keep', worst: 1 }], canceledBy: 'advantage' },
  },
  effects: {
    урон: { label: 'Урон', activation: 'manual', params: [{ key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }, { key: 'тип', label: 'Тип', kind: 'choice', from: 'типы' }], steps: [] },
    щит: { label: 'Щит', activation: 'passive', modifiers },
  },
} as unknown as System);

const pass = (modifiers: unknown[], values: Record<string, unknown> = {}) => {
  const system = world(modifiers);
  const sheet = { id: 'я', systemId: 'п', name: 'я', values, has: [], effects: [{ effectId: 'щит' }] } as unknown as Sheet;
  return newPass(system, sheet, { compendium: { records: [] } });
};

const both = (old: unknown, fresh: unknown, run: (p: ReturnType<typeof pass>) => unknown, values?: Record<string, unknown>) =>
  deepEq(run(pass([fresh], values)), run(pass([old], values)));

group('правка вызова: новая форма даёт то же, что старая', () => {
  test('урон × 0.5 только огнём', () => {
    const old = { kind: 'value', target: 'event:урон', op: 'mul', value: { expr: '0.5' }, tags: ['огонь'] };
    const fresh = { kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0.5' }, anyTags: ['огонь'] };
    both(old, fresh, p => [editNumber(p, 'урон', 'сколько', 10, ['огонь']), editNumber(p, 'урон', 'сколько', 10, ['холод'])]);
    eq(editNumber(pass([fresh]), 'урон', 'сколько', 10, ['огонь']), 5);
  });

  test('правка броска по метке и прибавка при условии', () => {
    const oldEdit = { kind: 'roll', target: 'roll:any', edit: 'advantage', tags: ['атака'] };
    const freshEdit = { kind: 'edit', call: 'roll', param: 'edits', edit: 'advantage', tags: ['атака'] };
    both(oldEdit, freshEdit, p => resolveRoll(p.system, p.sheet, ['атака'], p).edits.map(e => e.label));
    const oldAdd = { kind: 'roll', target: 'roll:any', op: 'add', value: { expr: '-2' }, condition: { expr: '@ранен' } };
    const freshAdd = { kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '-2' }, condition: { expr: '@ранен' } };
    both(oldAdd, freshAdd, p => resolveRoll(p.system, p.sheet, ['атака'], p).bonus, { ранен: true });
    eq(resolveRoll(pass([freshAdd]).system, pass([freshAdd]).sheet, [], pass([freshAdd], { ранен: true })).bonus, -2);
  });

  test('бросок по мне — as: against', () => {
    const old = { kind: 'roll', target: 'incoming:roll:any', edit: 'disadvantage', tags: ['атака'] };
    const fresh = { kind: 'edit', call: 'roll', param: 'edits', edit: 'disadvantage', tags: ['атака'], as: 'against' };
    both(old, fresh, p => incomingRollModifiers(['атака'], p).map(m => (m as Modifier & { edit?: string }).edit));
    eq(incomingRollModifiers(['атака'], pass([fresh])).length, 1);
    eq(resolveRoll(pass([fresh]).system, pass([fresh]).sheet, ['атака'], pass([fresh])).edits.length, 0, 'свой бросок она не трогает');
  });

  test('метки: tags — все, anyTags — любая, notTags — ни одной', () => {
    const mod = (extra: object) => [{ kind: 'edit', call: 'урон', param: 'сколько', op: 'add', value: { expr: '1' }, ...extra }];
    eq(editNumber(pass(mod({ tags: ['огонь', 'холод'] })), 'урон', 'сколько', 0, ['огонь']), 0);
    eq(editNumber(pass(mod({ anyTags: ['огонь', 'холод'] })), 'урон', 'сколько', 0, ['огонь']), 1);
    eq(editNumber(pass(mod({ notTags: ['огонь'] })), 'урон', 'сколько', 0, ['огонь']), 0);
  });

  test('правка несуществующего вызова — ошибка, а не тихо пропавшее сопротивление', () => {
    throws(() => pass([{ kind: 'edit', call: 'нет_такого', param: 'x', op: 'add', value: { expr: '1' } }]).resolve('хп'));
  });
});
