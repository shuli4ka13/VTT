import { group, test, eq, deepEq, throws } from './harness.ts';
import { newPass } from '../src/engine/calc.ts';
import { resolveRoll } from '../src/engine/modifiers.ts';
import { rollHeld, gather, stack } from '../src/core/edits.ts';
import type { Pass } from '../src/engine/calc.ts';
import type { System, Sheet } from '../src/model/types.ts';

const world = (modifiers: unknown[]): System => ({
  id: 'п', name: 'п',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 10 }, { key: 'ранен', label: 'Ранен', kind: 'boolean' }] },
    типы: { label: 'Типы урона', key: 'word', rows: [{ value: 'огонь', label: 'огонь' }, { value: 'холод', label: 'холод' }] },
  },
  roll_edits: {
    advantage: { label: 'Преимущество', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }], canceledBy: 'disadvantage' },
    disadvantage: { label: 'Помеха', ops: [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }], canceledBy: 'advantage' },
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

const edited = (held: Pass, call: string, param: string, base: number, tags: string[] = [], values: Record<string, unknown> = {}) =>
  stack(gather([{ id: held.sheet.id, view: held }], { call, param, tags, names: {}, values, view: () => held }), base, call);

group('правка вызова работает', () => {
  test('урон × 0.5 только огнём', () => {
    const fresh = { kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0.5' }, anyTags: ['огонь'] };
    eq(edited(pass([fresh]), 'урон', 'сколько', 10, ['огонь']), 5);
    eq(edited(pass([fresh]), 'урон', 'сколько', 10, ['холод']), 10);
  });

  test('правка броска по метке и прибавка при условии', () => {
    const freshEdit = { kind: 'edit', call: 'roll', param: 'edits', edit: 'advantage', tags: ['атака'] };
    const p = pass([freshEdit]);
    deepEq(resolveRoll(p.system, p.sheet, ['атака'], p).edits.map(e => e.label), ['Преимущество']);
    deepEq(resolveRoll(p.system, p.sheet, ['спасбросок'], p).edits, []);
    const freshAdd = { kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '-2' }, if: { expr: '@носитель.ранен' } };
    const hurt = pass([freshAdd], { ранен: true });
    eq(resolveRoll(hurt.system, hurt.sheet, [], hurt).bonus, -2);
    const fine = pass([freshAdd], { ранен: false });
    eq(resolveRoll(fine.system, fine.sheet, [], fine).bonus, 0);
  });

  test('бросок по мне — условие «против = носитель»', () => {
    const fresh = { kind: 'edit', call: 'roll', param: 'edits', edit: 'disadvantage', tags: ['атака'], if: { expr: '@против == @носитель' } };
    const p = pass([fresh]);
    const other = newPass(p.system, { id: 'другой', systemId: 'п', name: 'другой', values: {}, has: [], effects: [] } as never, { compendium: { records: [] } });
    const holders = [{ id: p.sheet.id, view: p }, { id: 'другой', view: other }];
    eq(rollHeld(holders, 'другой', p.sheet.id, ['атака']).length, 1);
    eq(rollHeld(holders, p.sheet.id, 'другой', ['атака']).length, 0, 'свой бросок против другого она не трогает');
    eq(resolveRoll(p.system, p.sheet, ['атака'], p).edits.length, 0, 'бросок без противника она не трогает');
  });

  test('метки: tags — все, anyTags — любая, notTags — ни одной', () => {
    const mod = (extra: object) => [{ kind: 'edit', call: 'урон', param: 'сколько', op: 'add', value: { expr: '1' }, ...extra }];
    eq(edited(pass(mod({ tags: ['огонь', 'холод'] })), 'урон', 'сколько', 0, ['огонь']), 0);
    eq(edited(pass(mod({ anyTags: ['огонь', 'холод'] })), 'урон', 'сколько', 0, ['огонь']), 1);
    eq(edited(pass(mod({ notTags: ['огонь'] })), 'урон', 'сколько', 0, ['огонь']), 0);
  });

  test('правка не той величины (вход переименовали) — ошибка, а не тихо пропавшая правка', () => {
    throws(() => pass([{ kind: 'edit', call: 'урон', param: 'старое_имя', op: 'add', value: { expr: '1' } }]).resolve('хп'), 'величина эффекта');
  });

  test('правка несуществующего вызова — ошибка, а не тихо пропавшее сопротивление', () => {
    throws(() => pass([{ kind: 'edit', call: 'нет_такого', param: 'x', op: 'add', value: { expr: '1' } }]).resolve('хп'));
  });
});

group('правка вызова в проверке системы', () => {
  const lint = async (modifiers: unknown[]) => {
    const { lintSystem, errorsOf } = await import('../src/model/lint.ts');
    return errorsOf(lintSystem(world(modifiers), { records: [] })).map(p => p.text).join('; ');
  };

  test('правка входа, которого нет, и голое поле в условии — ошибки словами', async () => {
    const text = await lint([
      { kind: 'edit', call: 'урон', param: 'нет', op: 'add', value: { expr: '1' } },
      { kind: 'edit', call: 'урон', param: 'сколько', op: 'add', value: { expr: '1' }, if: { expr: '@хп > 1' } },
      { kind: 'edit', call: 'урон', param: 'тип', op: 'add', value: { expr: '1' } },
    ]);
    eq(text.includes('нет входа «нет»'), true, text);
    eq(text.includes('«хп» — чьё поле?'), true, text);
    eq(text.includes('правит пока только величину'), true, text);
  });

  test('правка в записи книги и правка без выбора — тоже находки', async () => {
    const { lintSystem, errorsOf } = await import('../src/model/lint.ts');
    const book = { records: [{ id: 'кольцо', table: 'x', label: 'Кольцо', cells: {}, modifiers: [{ kind: 'edit', call: 'урон', param: 'тип', op: 'add', value: { expr: '1' } }, { kind: 'edit', call: 'roll', param: 'edits' }] }] };
    const text = errorsOf(lintSystem(world([]), book as never)).map(p => p.text).join('; ');
    eq(text.includes('правит пока только величину'), true, text);
    eq(text.includes('правка броска не выбрана'), true, text);
  });

  test('верная правка урона и броска — чисто', async () => {
    eq(await lint([
      { kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0.5' }, anyTags: ['огонь'] },
      { kind: 'edit', call: 'roll', param: 'edits', edit: 'advantage', if: { expr: '@против == @носитель' } },
    ]), '');
  });
});

group('правка вызова: условие над аргументами', () => {
  const mod = (cond: string) => [{ kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0.5' }, if: { expr: cond } }];

  test('формула видит вход вызова: срезается только крупный огненный урон', () => {
    const p = pass(mod('все(@тип == "огонь", @сколько >= 10)'));
    eq(edited(p, 'урон', 'сколько', 12, [], { тип: 'огонь', сколько: 12 }), 6);
    eq(edited(p, 'урон', 'сколько', 8, [], { тип: 'огонь', сколько: 8 }), 8);
    eq(edited(p, 'урон', 'сколько', 12, [], { тип: 'холод', сколько: 12 }), 12);
  });

  test('у броска есть @метки', () => {
    const p = pass([{ kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '2' }, if: { expr: 'есть(@метки, "атака")' } }]);
    eq(resolveRoll(p.system, p.sheet, ['атака'], p).bonus, 2);
    eq(resolveRoll(p.system, p.sheet, ['спасбросок'], p).bonus, 0);
  });

  test('чужое имя в условии — находка линта', async () => {
    const { lintSystem, errorsOf } = await import('../src/model/lint.ts');
    const text = errorsOf(lintSystem(world(mod('@нету > 1')), { records: [] })).map(p => p.text).join('; ');
    eq(text.includes('«нету» — нет ни входа, ни шага с таким именем'), true, text);
  });
});

group('правка вызова: условие над входом, которого не пришло', () => {
  test('сравнение с отсутствующим входом — правка не подходит, удар не падает', () => {
    const p = pass([{ kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0.5' }, if: { expr: '@сколько >= 10' } }]);
    eq(edited(p, 'урон', 'сколько', 12, [], {}), 12);
  });
});
