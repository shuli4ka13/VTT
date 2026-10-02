import { group, test, ok, eq } from './harness.ts';
import { exchange } from './play.ts';
import { EngineError } from '../src/engine/errors.ts';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import type { System, Effect, Sheet, Compendium } from '../src/model/types.ts';

const world = SAMPLE_WORLDS.find(w => w.system.id === 'dnd5e')!;
const { system, compendium } = world;
const arven = world.sheets.find(s => s.id === 'arven')!;
const mirra = world.sheets.find(s => s.id === 'mirra')!;

const die = () => 4;

group('один путь вызова', () => {
  test('хвост, вызывающий сам себя, обрывается внятной ошибкой, а не переполнением стека', () => {
    const looped = structuredClone(system) as System;
    looped.effects.damage = {
      label: 'Урон',
      params: [{ key: 'лист', label: 'Лист', kind: 'sheet' }, { key: 'amount', label: 'Сколько', kind: 'number', role: 'amount' }],
      steps: [{ type: 'emit', effect: 'damage', args: { лист: { expr: '@лист' }, amount: { expr: '@amount' } } }],
    } as unknown as Effect;
    looped.effects.echo = {
      label: 'Эхо', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true }],
      steps: [{ type: 'each', of: 'цели', as: 'цель' }, { type: 'emit', effect: 'damage', args: { лист: { expr: '@цель' }, amount: { expr: '3' } } }],
    } as unknown as Effect;
    looped.tables = { ...(looped.tables ?? {}), shout: { shape: 'book', use: 'action', label: 'Крик', bindings: [{ label: 'Эхо', effect: 'echo', args: {} }] } } as never;
    const book = { ...compendium, records: [...(compendium.records ?? []), { id: 'shout', table: 'shout', label: 'Крик', cells: {} }] } as Compendium;
    const sheet = { ...arven, has: [...arven.has, { of: 'shout' }] } as Sheet;
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
    const out = exchange({ system, compendium, die: () => 15, sheets: [arven, mirra], actionId: 'longsword:0', fromId: arven.id, toId: mirra.id });
    const target = out.sheets.find(s => s.id === mirra.id)!;
    ok((target.values.hp_current as number) < (mirra.values.hp_current as number), 'хиты цели упали');
    ok(out.reports.length > 0);
    eq(typeof out.reports[0]!.report.trace.length, 'number');
  });
});
