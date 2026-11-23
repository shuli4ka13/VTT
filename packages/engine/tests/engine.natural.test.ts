import { group, test, eq, ok, throws } from './harness.ts';
import { exchange } from './play.ts';
import { compile } from '../src/formula/index.ts';
import { toolsOf } from '../src/engine/refs.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const world = (versus: string, extra: Record<string, unknown>): System => ({
  id: 'н', name: 'н',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 50 }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }],
      steps: [
        { type: 'each', of: 'цели' },
        { id: 'бросок', type: 'roll', die: 'к20', bonus: { expr: '5' }, by: { expr: '@действующий' } },
        { id: 'попал', type: 'check', value: { expr: '@бросок' }, versus: { expr: versus }, ...extra },
        { type: 'branch', if: { expr: 'not @попал.success' } }, { type: 'stop' }, { type: 'end' },
        { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '1' } },
      ],
    },
  },
} as unknown as System);

const book = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] } as Compendium;
const sheets = (): Sheet[] => ['а', 'б'].map(id => ({ id, systemId: 'н', name: id, values: {}, has: [{ of: 'приём' }], effects: [] } as unknown as Sheet));

const strike = (versus: string, extra: Record<string, unknown>, die: number) => {
  const played = exchange({ system: world(versus, extra), compendium: book, die: () => die, sheets: sheets(), actionId: 'приём:0', fromId: 'а', toId: 'б' });
  return { hp: played.sheets.find(s => s.id === 'б')!.values.хп ?? 50, log: played.log.join('\n') };
};

const NATURAL = { succeedOn: { expr: '20' }, failOn: { expr: '1' } };

group('проверка: кость, решающая исход сама', () => {
  test('20 на кости попадает при недостижимом пороге, журнал говорит почему', () => {
    const out = strike('99', NATURAL, 20);
    eq(out.hp, 49);
    ok(out.log.includes('на кости 20 — всегда успех'), out.log);
  });

  test('1 на кости промахивается даже при пороге 0', () => {
    const out = strike('0', NATURAL, 1);
    eq(out.hp, 50);
    ok(out.log.includes('на кости 1 — всегда провал'), out.log);
  });

  test('между ними решает сумма', () => {
    eq(strike('10', NATURAL, 5).hp, 49);
    eq(strike('11', NATURAL, 5).hp, 50);
  });

  test('без полей натуральных правил нет', () => {
    eq(strike('99', {}, 20).hp, 50);
    eq(strike('0', {}, 1).hp, 49);
  });

  test('граница — формула: верный успех с 19', () => {
    eq(strike('99', { succeedOn: { expr: '10 + 9' } }, 19).hp, 49);
    eq(strike('99', { succeedOn: { expr: '10 + 9' } }, 18).hp, 50);
  });
});

group('формула «максимум костей»', () => {
  const tools = toolsOf({ tables: {} } as unknown as System, {} as never, 'я');
  const run = (src: string) => compile(src).evaluate(() => 0, tools);

  test('старшая грань каждой кости', () => {
    eq(run('dicemax("1d8")'), 8);
    eq(run('dicemax("2d6")'), 12);
    eq(run('dicemax("1d8", 3)'), 24);
  });

  test('лишний аргумент — ошибка словами', () => {
    throws(() => run('dicemax("1d8", 1, 2)'));
  });
});

group('ноль бросков — ноль', () => {
  test('максимум костей ноль раз даёт 0', () => {
    const tools = toolsOf({ tables: {} } as unknown as System, {} as never, 'я', () => 6);
    eq(compile('dicemax("2d6", 0)').evaluate(() => 0, tools), 0);
  });
});
