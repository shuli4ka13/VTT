import { group, test, ok, eq } from './harness.ts';
import { exchange } from './play.ts';
import { EngineError } from '../src/engine/errors.ts';
import { system, arven, mirra, compendium } from './fixtures.ts';
import type { System, Effect } from '../src/model/types.ts';

const die = () => 4;

group('один путь вызова', () => {
  test('хвост, вызывающий сам себя, обрывается внятной ошибкой, а не переполнением стека', () => {
    const looped = structuredClone(system) as System;
    looped.effects.damage = {
      label: 'Урон',
      params: [{ key: 'amount', label: 'Сколько', kind: 'number', role: 'amount' }],
      steps: [{ type: 'emit', event: 'damage', args: { amount: { expr: '@event.amount' } } }],
    } as unknown as Effect;
    looped.effects.echo = {
      label: 'Эхо', activation: 'manual',
      steps: [{ type: 'emit', event: 'damage', args: { amount: { expr: '3' } } }],
    } as unknown as Effect;
    looped.tables = { ...(looped.tables ?? {}), shout: { shape: 'book', use: 'action', label: 'Крик', bindings: [{ label: 'Эхо', effect: 'echo', args: {} }] } } as never;
    const book = { ...compendium, records: [...(compendium.records ?? []), { id: 'shout', table: 'shout', label: 'Крик', cells: {} }] };
    const sheet = { ...arven, has: [...arven.has, { of: 'shout' }] };
    let caught: unknown;
    try {
      exchange({ system: looped, compendium: book, die, sheets: [sheet, mirra], actionId: 'shout:0', fromId: sheet.id, toId: mirra.id });
    } catch (err) { caught = err; }
    ok(caught instanceof EngineError, `ожидалась EngineError, получено ${String(caught)}`);
    const text = (caught as Error).message;
    ok(/вызовы вложены глубже \d+/.test(text), text);
    ok(text.includes('damage → damage'), text);
  });

  test('вызов эффекта из записи доходит до цели и меняет её лист', () => {
    const out = exchange({ system, compendium, die: () => 15, sheets: [arven, mirra], actionId: 'longsword-item:0', fromId: arven.id, toId: mirra.id });
    const target = out.sheets.find(s => s.id === mirra.id)!;
    ok((target.values.hp_current as number) < (mirra.values.hp_current as number), 'хиты цели упали');
    ok(out.reports.length > 0);
    eq(typeof out.reports[0]!.report.trace.length, 'number');
  });
});
