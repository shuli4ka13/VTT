import { group, test, eq } from './harness.ts';
import { exchange } from './play.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const hurt = (tags?: unknown[]) => ({ type: 'emit', effect: 'урон', ...(tags ? { tags } : {}), args: { лист: { expr: '@цель' }, сколько: { expr: '5' } } });

const system = (steps: unknown[], guard: Record<string, unknown>): System => ({
  id: 'в', name: 'в',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }, { key: 'видел', label: 'Видел', kind: 'number' }] },
    стихии: { label: 'Стихии', key: 'word', rows: [{ value: 'стрела' }, { value: 'огонь' }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Чары', effect: 'чары', args: { стихия: { expr: '"огонь"' } } }] },
  },
  effects: {
    урон: {
      label: 'Урон', params: [{ key: 'лист', kind: 'sheet', role: 'target' }, { key: 'сколько', kind: 'number', role: 'amount' }],
      steps: [{ type: 'apply', target: { expr: '@лист.хп' }, value: { expr: '@сколько' } }],
    },
    чары: {
      label: 'Чары', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }, { key: 'стихия', kind: 'choice', from: 'стихии' }],
      steps: [{ type: 'each', of: 'цели' }, ...steps],
    },
    заслон: { label: 'Заслон', activation: 'passive', duration: { kind: 'permanent' }, ...guard },
  },
}) as unknown as System;

const book = { records: [{ id: 'приём', table: 'приём', label: 'Чары', cells: {} }] } as unknown as Compendium;
const sheet = (id: string, effects: string[] = []): Sheet => ({ id, systemId: 'в', name: id, values: { хп: 20, видел: 0 }, has: [{ of: 'приём' }], effects: effects.map(effectId => ({ effectId })) }) as unknown as Sheet;
const play = (s: System) => exchange({ system: s, compendium: book, die: () => 1, sheets: [sheet('а'), sheet('б', ['заслон'])], actionId: 'приём:0', fromId: 'а', toIds: ['б'] });
const target = (s: System, tag: string): unknown => play(s).sheets.find(one => one.id === 'б')!.values[tag];

const zero = (tags: string[]) => ({ modifiers: [{ kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0' }, tags, if: { expr: '@лист == @holder' } }] });

group('метки вызова ставит вызывающий', () => {
  test('правка вызова по метке гасит только помеченный вызов', () => {
    eq(target(system([hurt(['стрела'])], zero(['стрела'])), 'хп'), 20);
    eq(target(system([hurt()], zero(['стрела'])), 'хп'), 15);
  });

  test('метка вызова формулой — значение входа вызывающего', () => {
    eq(target(system([hurt([{ expr: '@стихия' }])], zero(['огонь'])), 'хп'), 20);
    eq(target(system([hurt([{ expr: '@стихия' }])], zero(['стрела'])), 'хп'), 15);
  });

  test('подписка на вызов видит метку среди меток вызова, в журнале вызов подписан меткой', () => {
    const heard = { on: [{ on: 'after:урон', if: { expr: '@лист == @holder and has(@tags, "стрела")' }, steps: [{ type: 'apply', target: { expr: '@holder.видел' }, direction: 'add', value: { expr: '1' } }] }] };
    eq(target(system([hurt(['стрела'])], heard), 'видел'), 1);
    eq(target(system([hurt()], heard), 'видел'), 0);
    eq(play(system([hurt(['стрела'])], heard)).log.join(' · ').includes('[стрела]'), true);
  });
});
