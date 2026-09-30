import { group, test, ok, throws, eq } from './harness.ts';
import { exchange } from '../src/events/exchange.ts';
import { MAX_CALL_DEPTH, packCall, runCall } from '../src/events/call.ts';
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
    ok(text.includes(`глубже ${MAX_CALL_DEPTH}`), text);
    ok(text.includes('damage → damage'), text);
  });

  test('packCall и runCall дают тот же результат, что прямой путь конверта', () => {
    const effect = system.effects.strike!;
    const world = { system, compendium, die };
    const packed = packCall({ effectId: 'strike', effect, sheet: arven, owner: 'тест', args: { damage_dice: '1d8', damage_type: 'рубящий' }, props: null }, world);
    ok(packed.length > 0);
    const done = runCall(packed, { sheet: mirra, owner: 'тест' }, world);
    eq(typeof done.trace.length, 'number');
    throws(() => runCall([{ type: 'котик' } as never], { sheet: mirra, owner: 'тест' }, world), 'котик');
  });
});
