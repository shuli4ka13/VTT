import { group, test, eq, ok } from './harness.ts';
import { exchange } from '../src/events/exchange.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'стол', name: 'стол',
  fields: [
    { tag: 'хп', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } },
    { tag: 'эскалация', label: 'Кость эскалации', desk: true, value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'страх', label: 'Страх', desk: true, value: { kind: 'stored', type: 'number', default: 0 } },
  ],
  effects: {
    удар: {
      label: 'Удар', activation: 'manual',
      steps: [
        { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', targetModifiers: false, value: { expr: '3 + @стол.эскалация' } },
        { type: 'apply', target: { tag: 'страх' }, direction: 'add', targetModifiers: false, value: { const: 1 } },
      ],
    },
  },
  records: { приём: { kind: 'action', label: 'Приём' } },
} as unknown as System;

const book = { items: [], actions: [{ id: 'удар', rk: 'приём', label: 'Удар', effect: 'удар' }] } as unknown as Compendium;
const pc = (id: string): Sheet => ({ id, systemId: 'стол', kind: 'pc', name: id, values: {}, equipped: [], effects: [], actions: ['удар'] } as unknown as Sheet);
const desk = (values: Record<string, number>): Sheet => ({ id: 'стол', systemId: 'стол', kind: 'desk', name: 'Стол', values, equipped: [], effects: [], actions: [] } as unknown as Sheet);

const hit = (deskValues: Record<string, number>) => exchange({
  system, compendium: book, die: () => 1,
  sheets: [pc('бьёт'), pc('держит'), desk(deskValues)], actionId: 'удар:0', fromId: 'бьёт', toId: 'держит',
});

group('стол — третий участник с полями', () => {
  test('эффект читает кость эскалации со стола: 3 + 2', () => {
    const out = hit({ эскалация: 2 });
    eq(out.sheets.find(s => s.id === 'держит')!.values.хп, 20 - 5);
  });

  test('эффект меняет поле стола, а не лист цели', () => {
    const out = hit({ эскалация: 0, страх: 4 });
    eq(out.sheets.find(s => s.id === 'стол')!.values.страх, 5);
    ok(!('страх' in out.sheets.find(s => s.id === 'держит')!.values), 'страх не лёг на лист цели');
  });

  test('без стола чтение со стола — внятная ошибка', () => {
    let why = '';
    try {
      exchange({ system, compendium: book, die: () => 1, sheets: [pc('бьёт'), pc('держит')], actionId: 'удар:0', fromId: 'бьёт', toId: 'держит' });
    } catch (err) { why = (err as Error).message; }
    ok(why.includes('стола нет'), why);
  });
});

group('проверки конструктора про стол', () => {
  test('поле стола, написанное как поле получателя, — ошибка словами', async () => {
    const { lintSystem, errorsOf } = await import('../src/model/lint.ts');
    const wrong = JSON.parse(JSON.stringify(system)) as System;
    (wrong.effects.удар!.steps![0] as { value: { expr: string } }).value.expr = '3 + @получатель.эскалация';
    const texts = errorsOf(lintSystem(wrong, book)).map(p => p.text);
    ok(texts.some(t => t.includes('лежит на столе') && t.includes('@стол.эскалация')), texts.join(' | '));
  });

  test('правильная запись проходит', async () => {
    const { lintSystem, errorsOf } = await import('../src/model/lint.ts');
    eq(errorsOf(lintSystem(system, book)).length, 0);
  });
});
