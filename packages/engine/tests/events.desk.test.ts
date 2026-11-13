import { group, test, eq, ok } from './harness.ts';
import { exchange } from './play.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';
import { withColumn } from '../src/model/sheet-columns.ts';

const system = {
  id: 'стол', name: 'стол',
  tables: { лист: { shape: 'single', columns: [
    { key: 'хп', label: 'Хиты', kind: 'number', default: 20 },
  ] }, стол: { shape: 'single', owner: 'desk', columns: [
    { key: 'эскалация', label: 'Кость эскалации', kind: 'number' },
    { key: 'страх', label: 'Страх', kind: 'number' },
  ] } , приём: { shape: 'book', use: 'action', label: 'Приём' } },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual',
      params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }, { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' } }],
      steps: [
        { type: 'each', of: 'цели' },
        { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '3 + @стол.эскалация' } },
        { type: 'apply', target: { expr: '@стол.страх' }, direction: 'add', value: { expr: '1' } },
      ],
    },
  },
  
} as unknown as System;

const book = { records: [{ id: 'удар', table: 'приём', label: 'Удар', bindings: [{ label: 'Удар', effect: 'удар', args: {} }] }] } as unknown as Compendium;
const pc = (id: string): Sheet => ({ id, systemId: 'стол', name: id, values: {}, has: [{ of: 'удар' }], effects: [] } as unknown as Sheet);
const desk = (values: Record<string, number>): Sheet => ({ id: 'стол', systemId: 'стол', name: 'Стол', values, has: [], effects: [] } as unknown as Sheet);

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

  test('стола в наборе нет — поля стола читаются по умолчанию, а на лист цели ничего не ложится', () => {
    const out = exchange({ system, compendium: book, die: () => 1, sheets: [pc('бьёт'), pc('держит')], actionId: 'удар:0', fromId: 'бьёт', toId: 'держит' });
    eq(out.sheets.find(s => s.id === 'держит')!.values.хп, 20 - 3, 'эскалация по умолчанию 0');
    ok(!('страх' in out.sheets.find(s => s.id === 'держит')!.values));
  });

  test('у системы без полей стола чтение со стола — внятная ошибка', () => {
    const { стол: _desk, ...tables } = system.tables!;
    const plain = { ...system, tables } as System;
    let why = '';
    try {
      exchange({ system: plain, compendium: book, die: () => 1, sheets: [pc('бьёт'), pc('держит')], actionId: 'удар:0', fromId: 'бьёт', toId: 'держит' });
    } catch (err) { why = (err as Error).message; }
    ok(why.includes('стола нет'), why);
  });
});

group('проверки конструктора про стол', () => {
  test('поле стола, написанное голым именем, — ошибка словами', async () => {
    const { lintSystem, errorsOf } = await import('../src/model/lint.ts');
    const wrong = JSON.parse(JSON.stringify(system)) as System;
    (wrong.effects.удар!.steps![1] as { value: { expr: string } }).value.expr = '3 + @эскалация';
    const texts = errorsOf(lintSystem(wrong, book)).map(p => p.text);
    ok(texts.some(t => t.includes('лежит на столе') && t.includes('@стол.эскалация')), texts.join(' | '));
  });

  test('правильная запись проходит', async () => {
    const { lintSystem, errorsOf } = await import('../src/model/lint.ts');
    eq(errorsOf(lintSystem(system, book)).length, 0);
  });
});

group('стол в формулах листа', () => {
  const withSheetFormula = (expr: string, desk = false) => {
    return withColumn(system, { key: 'атака', label: 'Атака', expr: { expr } }, desk ? 'desk' : 'sheet');
  };

  test('поле листа читает стол через @стол', async () => {
    const { calc, newPass } = await import('../src/engine/calc.ts');
    const s = withSheetFormula('5 + @стол.эскалация');
    const hero = pc('герой');
    eq(calc(s, hero, 'атака', newPass(s, hero, { shared: [desk({ эскалация: 3 })] })), 8);
  });

  test('поле стола без @стол в формуле листа — ошибка словами', async () => {
    const { lintSystem, errorsOf } = await import('../src/model/lint.ts');
    const texts = errorsOf(lintSystem(withSheetFormula('5 + @эскалация'), book)).map(p => p.text);
    ok(texts.some(t => t.includes('лежит на столе')), texts.join(' | '));
  });

  test('у поля самого стола соседние поля стола пишутся без приставки', async () => {
    const { lintSystem, errorsOf } = await import('../src/model/lint.ts');
    eq(errorsOf(lintSystem(withSheetFormula('@страх + @эскалация', true), book)).length, 0);
  });
});
