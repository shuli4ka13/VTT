import { group, test, eq, deepEq, throws } from './harness.ts';
import { newPass } from '../src/engine/calc.ts';
import { editNumber, resolveRoll, incomingRollModifiers } from '../src/engine/modifiers.ts';
import { asEdits } from '../../../samples/convert/edits.ts';
import type { System, Sheet } from '../src/model/types.ts';

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

group('проход перевода: старая форма становится правкой вызова', () => {
  const convert = (mod: unknown) => asEdits(world([]), mod as Record<string, unknown>);

  test('урон × 0.5 огнём: event: → вызов «урон», его величина, метки — «любая из»', () => {
    deepEq(convert({ kind: 'value', target: 'event:урон', op: 'mul', value: { expr: '0.5' }, tags: ['огонь'] }),
      [{ op: 'mul', value: { expr: '0.5' }, kind: 'edit', call: 'урон', param: 'сколько', anyTags: ['огонь'] }]);
  });

  test('бросок: правка и прибавка в одном — две правки; бросок по мне — as: against', () => {
    deepEq(convert({ kind: 'roll', target: 'incoming:roll:any', edit: 'advantage', op: 'add', value: { expr: '1' }, tags: ['атака'] }), [
      { tags: ['атака'], kind: 'edit', call: 'roll', param: 'edits', edit: 'advantage', as: 'against' },
      { tags: ['атака'], kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '1' }, as: 'against' },
    ]);
  });
});

group('правка вызова работает', () => {
  test('урон × 0.5 только огнём', () => {
    const fresh = { kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0.5' }, anyTags: ['огонь'] };
    eq(editNumber(pass([fresh]), 'урон', 'сколько', 10, ['огонь']), 5);
    eq(editNumber(pass([fresh]), 'урон', 'сколько', 10, ['холод']), 10);
  });

  test('правка броска по метке и прибавка при условии', () => {
    const freshEdit = { kind: 'edit', call: 'roll', param: 'edits', edit: 'advantage', tags: ['атака'] };
    const p = pass([freshEdit]);
    deepEq(resolveRoll(p.system, p.sheet, ['атака'], p).edits.map(e => e.label), ['Преимущество']);
    deepEq(resolveRoll(p.system, p.sheet, ['спасбросок'], p).edits, []);
    const freshAdd = { kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '-2' }, condition: { expr: '@ранен' } };
    const hurt = pass([freshAdd], { ранен: true });
    eq(resolveRoll(hurt.system, hurt.sheet, [], hurt).bonus, -2);
    const fine = pass([freshAdd], { ранен: false });
    eq(resolveRoll(fine.system, fine.sheet, [], fine).bonus, 0);
  });

  test('бросок по мне — as: against', () => {
    const fresh = { kind: 'edit', call: 'roll', param: 'edits', edit: 'disadvantage', tags: ['атака'], as: 'against' };
    const p = pass([fresh]);
    eq(incomingRollModifiers(['атака'], p).length, 1);
    eq(resolveRoll(p.system, p.sheet, ['атака'], p).edits.length, 0, 'свой бросок она не трогает');
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

group('правка вызова в проверке системы', () => {
  const lint = async (modifiers: unknown[]) => {
    const { lintSystem, errorsOf } = await import('../src/model/lint.ts');
    return errorsOf(lintSystem(world(modifiers), { records: [] })).map(p => p.text).join('; ');
  };

  test('правка входа, которого нет, и «по мне» у эффекта — ошибки словами', async () => {
    const text = await lint([
      { kind: 'edit', call: 'урон', param: 'нет', op: 'add', value: { expr: '1' } },
      { kind: 'edit', call: 'урон', param: 'сколько', op: 'add', value: { expr: '1' }, as: 'against' },
      { kind: 'edit', call: 'урон', param: 'тип', op: 'add', value: { expr: '1' } },
    ]);
    eq(text.includes('нет входа «нет»'), true, text);
    eq(text.includes('бывает только у броска'), true, text);
    eq(text.includes('правит пока только величину'), true, text);
  });

  test('верная правка урона и броска — чисто', async () => {
    eq(await lint([
      { kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0.5' }, anyTags: ['огонь'] },
      { kind: 'edit', call: 'roll', param: 'edits', edit: 'advantage', as: 'against' },
    ]), '');
  });
});
