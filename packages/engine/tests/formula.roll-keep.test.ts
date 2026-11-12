import { group, test, eq, ok, throws } from './harness.ts';
import { compile } from '../src/formula/index.ts';
import { exchange } from './play.ts';
import type { System } from '../src/model/types.ts';

const шаг = (extra: Record<string, unknown>) => ({
  id: 'r', label: 'Р', activation: 'manual',
  params: [{ key: 'действующий', kind: 'sheet' }],
  steps: [{ id: 'бросок', type: 'roll', die: { expr: '1к10' }, ...extra }],
});

const play = (extra: Record<string, unknown>, ...faces: number[]) => {
  const система = {
    id: 'к', name: 'к',
    tables: { лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'х', label: 'Х', kind: 'number', default: 1 }] } },
    constants: {},
    effects: { r: шаг(extra) },
  } as unknown as System;
  const книга = { records: [] } as never;
  const я = { id: 'я', systemId: 'к', name: 'я', values: {}, has: [], effects: [] } as never;
  return () => exchange({ system: система, compendium: книга, die: () => faces.shift() ?? 1, sheets: [я], actionId: '+r', fromId: 'я' }).reports[0]!.report.trace.find((t: Record<string, unknown>) => t.step === 'бросок') as Record<string, unknown>;
};

group('шаг «Бросок»: оставить лучшие или худшие', () => {
  test('оставить лучшие: 3к10, две лучшие', () => eq(play({ count: { expr: '3' }, keep: { expr: '2' } }, 4, 9, 7)().total, 16));
  test('оставить худшие: 2к10, худшая', () => eq(play({ count: { expr: '2' }, keep: { expr: '1' }, keepWorst: true }, 5, 2)().total, 2));
  test('без «оставить» — сумма', () => eq(play({ count: { expr: '2' } }, 5, 2)().total, 7));
  test('дробное число оставить — ошибка словами', () => {
    const беда = throws(() => play({ count: { expr: '2' }, keep: { expr: '1.5' } })());
    ok(String(беда.message).includes('оставить'), String(беда.message));
  });
});

group('«кинуть(кость, сколько, оставить)» ушла из языка', () => {
  test('узнаётся и отвечает, что кости бросает шаг', () => {
    const беда = throws(() => compile('кинуть("1к10", 3, 2)').evaluate(() => undefined));
    ok(String(беда.message).includes('шаг «Бросок»'), String(беда.message));
  });
});
