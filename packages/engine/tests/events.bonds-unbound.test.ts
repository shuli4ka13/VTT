import { group, test, eq, ok, deepEq } from './harness.ts';
import { exchange } from './play.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Sheet, Compendium, WornEffect } from '../src/model/types.ts';

const who = { key: 'действующий', label: 'Кто действует', kind: 'sheet', role: 'actor' };
const whom = { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' } };
const put = (effect: string, extra: object = {}) => ({ type: 'status', effect, to: { expr: '@цель' }, ...extra });
const passive = (label: string, extra: object = {}) => ({ label, activation: 'passive', duration: { kind: 'permanent' }, ...extra });

const system = {
  id: 'x', name: 'x',
  tables: { лист: { shape: 'single', columns: [{ key: 'бонус', label: 'Бонус', kind: 'number' }] } },
  effects: {
    концентрация: passive('Концентрация'),
    поддержание: passive('Поддержание', { reapply: 'stack' }),
    слеп: passive('Ослеплён'),
    ожог: passive('Ожог', { reapply: 'refresh' }),
    взгляд: {
      label: 'Взгляд', params: [who, whom], bond: { effect: 'концентрация', by: 'действующий' },
      steps: [{ type: 'each', of: 'цели' }, put('слеп'), put('ожог', { unbound: true })],
    },
    взгляд_весь: {
      label: 'Взгляд весь', params: [who, whom], bond: { effect: 'концентрация', by: 'действующий' },
      steps: [{ type: 'each', of: 'цели' }, put('слеп'), put('ожог')],
    },
    взгляд_много: {
      label: 'Взгляд много', params: [who, whom], bond: { effect: 'поддержание', by: 'действующий', many: true },
      steps: [{ type: 'each', of: 'цели' }, put('слеп'), put('ожог', { unbound: true })],
    },
    только_ожог: {
      label: 'Только ожог', params: [who, whom], bond: { effect: 'поддержание', by: 'действующий', many: true },
      steps: [{ type: 'each', of: 'цели' }, put('ожог', { unbound: true })],
    },
    сбить: {
      label: 'Сбить', params: [who, whom],
      steps: [{ type: 'each', of: 'цели' }, { type: 'status', mode: 'remove', effect: 'концентрация', to: { expr: '@цель' } }],
    },
    отпустить: {
      label: 'Отпустить', params: [who],
      steps: [{ type: 'status', mode: 'remove', effect: 'поддержание', to: { expr: '@действующий' } }],
    },
  },
  grants: ['взгляд', 'взгляд_весь', 'взгляд_много', 'только_ожог', 'сбить', 'отпустить'],
} as unknown as System;

const compendium = { records: [] } as unknown as Compendium;
const sheet = (id: string): Sheet => ({ id, systemId: 'x', name: id, values: {}, has: [], effects: [] } as unknown as Sheet);
const room = (): Sheet[] => [sheet('маг'), sheet('воин'), sheet('лучник')];
let made = 0;
const play = (sheets: Sheet[], effect: string, fromId: string, toIds: string[] = []): Sheet[] =>
  exchange({ system, compendium, die: () => 1, sheets, actionId: `+${effect}`, fromId, toIds, newId: () => `id${++made}` }).sheets;
const worn = (sheets: Sheet[], id: string, effect: string): WornEffect[] =>
  (sheets.find(s => s.id === id)!.effects ?? []).filter(e => e.effectId === effect);

group('привязка к якорю: наложение «остаётся»', () => {
  test('одно якорь: привязано только ослепление, ожог без ссылки на якорь', () => {
    const out = play(room(), 'взгляд', 'маг', ['воин']);
    eq(worn(out, 'маг', 'концентрация').length, 1);
    deepEq(worn(out, 'воин', 'слеп')[0]!.bond, { sheet: 'маг', effect: 'концентрация' });
    eq(worn(out, 'воин', 'ожог')[0]!.bond, undefined);
  });

  test('сняли якорь — ослепление спало, ожог остался', () => {
    const out = play(play(room(), 'взгляд', 'маг', ['воин']), 'сбить', 'воин', ['маг']);
    eq(worn(out, 'воин', 'слеп').length, 0);
    eq(worn(out, 'воин', 'ожог').length, 1);
  });

  test('новый каст с одним якорем отпускает прежнее привязанное, но не «остаётся»', () => {
    const out = play(play(room(), 'взгляд', 'маг', ['воин']), 'взгляд', 'маг', ['лучник']);
    eq(worn(out, 'воин', 'слеп').length, 0);
    eq(worn(out, 'воин', 'ожог').length, 1);
    eq(worn(out, 'лучник', 'слеп').length, 1);
  });

  test('каждое отдельно: экземпляр якоря держит только ослепление; отпустили — ожог остался', () => {
    const once = play(room(), 'взгляд_много', 'маг', ['воин']);
    const anchor = worn(once, 'маг', 'поддержание');
    eq(anchor.length, 1);
    eq(worn(once, 'воин', 'ожог')[0]!.bond, undefined);
    const out = play(once, 'отпустить', 'маг');
    eq(worn(out, 'воин', 'слеп').length, 0);
    eq(worn(out, 'воин', 'ожог').length, 1);
  });

  test('каждое отдельно: легло только «остаётся» — экземпляр якоря не заводится', () => {
    const out = play(room(), 'только_ожог', 'маг', ['воин']);
    eq(worn(out, 'маг', 'поддержание').length, 0);
    eq(worn(out, 'воин', 'ожог').length, 1);
  });

  test('повторное наложение с обновлением: решает последнее — привязанный ожог становится непривязанным', () => {
    const bound = play(room(), 'взгляд_весь', 'маг', ['воин']);
    ok(Boolean(worn(bound, 'воин', 'ожог')[0]!.bond));
    const out = play(bound, 'взгляд', 'маг', ['воин']);
    eq(worn(out, 'воин', 'ожог').length, 1);
    eq(worn(out, 'воин', 'ожог')[0]!.bond, undefined);
  });
});

group('привязка к якорю: «Проблемы» про «остаётся»', () => {
  const { только_ожог: _, ...clean } = system.effects as Record<string, unknown>;
  const lint = (effects: Record<string, unknown>): string[] =>
    errorsOf(lintSystem({ ...system, effects: { ...clean, ...effects }, grants: (system.grants ?? []).filter(g => g !== 'только_ожог') } as System)).map(p => p.text);

  test('пример без находок', () => {
    deepEq(lint({}), []);
  });

  test('«остаётся» у эффекта без привязки — ошибка', () => {
    ok(lint({ сам: { label: 'Сам', params: [who, whom], steps: [{ type: 'each', of: 'цели' }, put('ожог', { unbound: true })] } })
      .some(text => text.includes('нет привязки к якорю')));
  });

  test('«остаётся» в режиме «снять» — ошибка', () => {
    ok(lint({ снять: { label: 'Снять', params: [who, whom], bond: { effect: 'концентрация', by: 'действующий' },
      steps: [{ type: 'each', of: 'цели' }, put('слеп'), { type: 'status', mode: 'remove', effect: 'ожог', to: { expr: '@цель' }, unbound: true }] } })
      .some(text => text.includes('здесь не действует')));
  });

  test('все наложения «остаётся» при привязке — «привязывать нечего»', () => {
    ok(lint({ только_ожог: system.effects['только_ожог'] }).some(text => text.includes('привязывать нечего')));
  });
});

group('привязка к якорю: один якорь с разным «Сколько якорей»', () => {
  const mixed = {
    ...system,
    effects: {
      ...system.effects,
      взгляд_один: { label: 'Взгляд один', params: [who, whom], bond: { effect: 'поддержание', by: 'действующий' }, steps: [{ type: 'each', of: 'цели' }, put('слеп')] },
    },
    grants: [...(system.grants ?? []), 'взгляд_один'],
  } as unknown as System;

  test('«Поддержание» в одном эффекте «один», в другом «свой на каждое действие» — замечание у обоих', () => {
    const found = lintSystem(mixed).filter(p => p.text.includes('в одних эффектах один'));
    ok(found.some(p => (p.where as { effect?: string }).effect === 'взгляд_один'), JSON.stringify(found.map(p => p.where)));
    ok(found.some(p => (p.where as { effect?: string }).effect === 'взгляд_много'), JSON.stringify(found.map(p => p.where)));
  });

  test('разные якоря у разных режимов — замечания нет', () => {
    eq(lintSystem(system).some(p => p.text.includes('в одних эффектах один')), false);
  });
});
