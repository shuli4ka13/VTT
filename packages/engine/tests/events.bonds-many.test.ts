import { group, test, eq, ok, deepEq } from './harness.ts';
import { exchange } from './play.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Sheet, Compendium, WornEffect } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  tables: {
    лист: { shape: 'single', columns: [{ key: 'бонус', label: 'Бонус', kind: 'number' }] },
    чары: {
      shape: 'book', use: 'action', label: 'Чары', columns: [],
      bindings: [
        { label: 'Сотворить', effect: 'колдовство', args: { держит: { expr: 'да' } } },
        { label: 'Прекратить', effect: 'прекратить', args: {} },
        { label: 'Развеять', effect: 'развеять', args: {} },
        { label: 'Мгновенное', effect: 'колдовство', args: { держит: { expr: 'нет' } } },
      ],
    },
  },
  effects: {
    колдовство: {
      label: 'Колдовство', activation: 'manual',
      bond: { effect: 'поддержание', by: 'действующий', if: { expr: '@держит' }, many: true, args: { заклинание: { expr: '@чары' } } },
      params: [
        { key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } },
        { key: 'держит', kind: 'boolean', default: false }, { key: 'чары', kind: 'effect', default: 'щит' },
      ],
      steps: [{ type: 'each', of: 'цели' }, { type: 'status', mode: 'apply', effect: { expr: '@чары' }, to: { expr: '@цель' } }],
    },
    прекратить: {
      label: 'Прекратить', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'чары', kind: 'effect', default: 'щит' }],
      steps: [{ type: 'status', mode: 'remove', effect: 'поддержание', to: { expr: '@действующий' }, where: { expr: '@заклинание == @чары' }, one: true }],
    },
    развеять: {
      label: 'Развеять', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }],
      steps: [{ type: 'each', of: 'цели' }, { type: 'status', mode: 'remove', effect: 'щит', to: { expr: '@цель' } }],
    },
    поддержание: {
      label: 'Поддержание', activation: 'passive', duration: { kind: 'permanent' }, reapply: 'stack',
      params: [{ key: 'заклинание', kind: 'effect' }],
    },
    щит: {
      label: 'Щит', activation: 'passive', duration: { kind: 'permanent' }, reapply: 'refresh',
      modifiers: [{ kind: 'value', target: 'бонус', op: 'add', value: { expr: '2' } }],
    },
  },
} as unknown as System;

const compendium = { records: [{ id: 'чары', table: 'чары', label: 'Чары', cells: {} }] } as unknown as Compendium;

const sheet = (id: string, effects: object[] = []): Sheet => ({
  id, systemId: 'x', name: id, values: {}, has: [{ of: 'чары' }], effects,
} as unknown as Sheet);

const room = (): Sheet[] => [sheet('маг'), sheet('маг2'), sheet('воин'), sheet('лучник'), sheet('вор')];
let made = 0;
const newId = (): string => `id${++made}`;
const play = (sheets: Sheet[], actionId: string, fromId: string, toIds: string[] = []): Sheet[] =>
  exchange({ system, compendium, die: () => 1, sheets, actionId, fromId, toIds, newId }).sheets;
const of = (sheets: Sheet[], id: string): WornEffect[] => sheets.find(s => s.id === id)!.effects ?? [];
const holders = (sheets: Sheet[], id: string): WornEffect[] => of(sheets, id).filter(e => e.effectId === 'поддержание');
const shields = (sheets: Sheet[], id: string): WornEffect[] => of(sheets, id).filter(e => e.effectId === 'щит');

group('многоместное держание: экземпляр держателя на каждое сотворение', () => {
  test('сотворение на три цели — один экземпляр, он помнит, что держит; наложенное знает свой экземпляр', () => {
    const out = play(room(), 'чары:0', 'маг', ['воин', 'лучник', 'вор']);
    const [holder, ...rest] = holders(out, 'маг');
    eq(rest.length, 0);
    ok(Boolean(holder!.inst));
    deepEq(holder!.args, { заклинание: 'щит' });
    for (const id of ['воин', 'лучник', 'вор']) deepEq(shields(out, id)[0]!.bond, { sheet: 'маг', effect: 'поддержание', inst: holder!.inst });
  });

  test('второе сотворение не отпускает первое — два экземпляра', () => {
    const once = play(room(), 'чары:0', 'маг', ['воин']);
    const twice = play(once, 'чары:0', 'маг', ['лучник']);
    const list = holders(twice, 'маг');
    eq(list.length, 2);
    ok(list[0]!.inst !== list[1]!.inst);
    eq(shields(twice, 'воин').length, 1);
    eq(shields(twice, 'лучник').length, 1);
  });

  test('ключи экземпляров не совпадают, даже если ключи действий начинаются заново', () => {
    const bare = (sheets: Sheet[], to: string): Sheet[] => exchange({ system, compendium, die: () => 1, sheets, actionId: 'чары:0', fromId: 'маг', toIds: [to] }).sheets;
    const list = holders(bare(bare(room(), 'воин'), 'лучник'), 'маг');
    eq(list.length, 2);
    ok(list[0]!.inst !== list[1]!.inst);
  });

  test('без держания (условие ложно) — экземпляра нет, наложенное без связи', () => {
    const out = play(room(), 'чары:3', 'маг', ['воин']);
    eq(holders(out, 'маг').length, 0);
    eq(shields(out, 'воин')[0]!.bond, undefined);
  });

  test('ни одной цели — экземпляр всё равно ставится', () => {
    eq(holders(play(room(), 'чары:0', 'маг'), 'маг').length, 1);
  });
});

group('держатель спадает, когда держать больше нечего', () => {
  test('снято с последней цели — экземпляр спал', () => {
    const cast = play(room(), 'чары:0', 'маг', ['воин']);
    const out = play(cast, 'чары:2', 'маг2', ['воин']);
    eq(shields(out, 'воин').length, 0);
    eq(holders(out, 'маг').length, 0);
  });

  test('снято с одной из двух — экземпляр держится второй', () => {
    const cast = play(room(), 'чары:0', 'маг', ['воин', 'лучник']);
    const out = play(cast, 'чары:2', 'маг2', ['воин']);
    eq(holders(out, 'маг').length, 1);
    eq(shields(out, 'лучник').length, 1);
  });

  test('пустой с самого начала экземпляр сам не спадает', () => {
    const cast = play(room(), 'чары:0', 'маг');
    const out = play(cast, 'чары:2', 'маг2', ['воин']);
    eq(holders(out, 'маг').length, 1);
  });

  test('спал один из двух экземпляров — второй цел', () => {
    const cast = play(play(room(), 'чары:0', 'маг', ['воин']), 'чары:0', 'маг', ['лучник']);
    const out = play(cast, 'чары:2', 'маг2', ['воин']);
    eq(holders(out, 'маг').length, 1);
    eq(shields(out, 'лучник').length, 1);
  });
});

group('снять по входам', () => {
  test('«одно» снимает самый ранний экземпляр по условию и его держимое со всех целей', () => {
    const cast = play(play(room(), 'чары:0', 'маг', ['воин', 'лучник']), 'чары:0', 'маг', ['вор']);
    const out = play(cast, 'чары:1', 'маг');
    eq(holders(out, 'маг').length, 1);
    eq(shields(out, 'воин').length, 0);
    eq(shields(out, 'лучник').length, 0);
    eq(shields(out, 'вор').length, 1);
  });

  test('условие не совпало — ничего не снято', () => {
    const cast = play(room(), 'чары:0', 'маг', ['воин']);
    const other = structuredClone(system) as System & { effects: Record<string, any> };
    other.effects.прекратить.params[1].default = 'другое';
    const out = exchange({ system: other, compendium, die: () => 1, sheets: cast, actionId: 'чары:1', fromId: 'маг', toIds: [], newId }).sheets;
    eq(holders(out, 'маг').length, 1);
    eq(shields(out, 'воин').length, 1);
  });

  test('экземпляр без запомненного входа условию не совпадает и «Прекратить» не роняет', () => {
    const bare = [sheet('маг', [{ effectId: 'поддержание', inst: 'руками' }]), sheet('воин')];
    const cast = play(bare, 'чары:0', 'маг', ['воин']);
    const out = play(cast, 'чары:1', 'маг');
    deepEq(holders(out, 'маг').map(e => e.inst), ['руками']);
    eq(shields(out, 'воин').length, 0);
  });

  test('экземпляр без держимого снимается тем же «Прекратить»', () => {
    const out = play(play(room(), 'чары:0', 'маг'), 'чары:1', 'маг');
    eq(holders(out, 'маг').length, 0);
  });

  test('маги держат одно на разных целях — «Прекратить» одного не трогает другого', () => {
    const cast = play(play(room(), 'чары:0', 'маг', ['воин']), 'чары:0', 'маг2', ['лучник']);
    const out = play(cast, 'чары:1', 'маг');
    eq(holders(out, 'маг').length, 0);
    eq(holders(out, 'маг2').length, 1);
    eq(shields(out, 'воин').length, 0);
    eq(shields(out, 'лучник').length, 1);
  });

  test('без условия «Снять» снимает все копии, как прежде', () => {
    const cast = play(play(room(), 'чары:0', 'маг', ['воин']), 'чары:0', 'маг', ['лучник']);
    const all = structuredClone(system) as System & { effects: Record<string, any> };
    delete all.effects.прекратить.steps[0].where;
    delete all.effects.прекратить.steps[0].one;
    const out = exchange({ system: all, compendium, die: () => 1, sheets: cast, actionId: 'чары:1', fromId: 'маг', toIds: [], newId }).sheets;
    eq(holders(out, 'маг').length, 0);
  });
});

group('проверка системы: многоместное держание и снятие по входам', () => {
  const texts = (s: System): string[] => errorsOf(lintSystem(s, compendium)).map(p => p.text);

  test('образец теста без ошибок: имена снимаемого видны в условии', () => {
    deepEq(texts(system), []);
  });

  test('держатель запоминает вход только при многоместном держании', () => {
    const one = structuredClone(system) as System & { effects: Record<string, any> };
    delete one.effects.колдовство.bond.many;
    ok(texts(one).some(t => t.includes('только при многоместном держании')));
  });

  test('вход, которого у держателя нет, — ошибка', () => {
    const bad = structuredClone(system) as System & { effects: Record<string, any> };
    bad.effects.колдовство.bond.args = { нечто: { expr: '@чары' } };
    ok(texts(bad).some(t => t.includes('не знает входа «нечто»')));
  });

  test('«Какие снять» у наложения — не действует', () => {
    const bad = structuredClone(system) as System & { effects: Record<string, any> };
    bad.effects.колдовство.steps[1].where = { expr: 'да' };
    ok(texts(bad).some(t => t.includes('«Какие снять» здесь не действует')));
  });
});
