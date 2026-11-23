import { group, test, eq, ok } from './harness.ts';
import { fieldOf, momentOf, MOMENTS } from '../src/events/moments.ts';
import { fireMoments, fireCrossings } from './kit.ts';
import { PLAYABLE_WORLDS as SAMPLE_WORLDS } from '../src/model/systems.ts';
import type { System, Sheet, Effect, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  tables: { лист: { shape: 'single', columns: [
    { key: 'хиты', label: 'Хиты', kind: 'number', default: 20 },
    { key: 'яд', label: 'Отравлен', kind: 'boolean' },
  ] } },
  effects: {
    отравление: {
      label: 'Отравление', activation: 'passive',
      on: [{ on: 'moment:turn-start', if: { expr: '@ходит == @носитель' }, steps: [{ type: 'apply', target: { expr: '@носитель.хиты' }, direction: 'subtract', value: { expr: '3' } }] }],
    },
    передышка: {
      label: 'Передышка', activation: 'passive',
      on: [{ on: 'moment:turn-end', if: { expr: '@ходит == @носитель' }, steps: [{ type: 'apply', target: { expr: '@носитель.хиты' }, direction: 'add', value: { expr: '1' } }] }],
    },
  },
} as unknown as System;

const sheet = (worn: string[], values: Record<string, unknown> = {}): Sheet => ({
  id: 'а', systemId: 'x', name: 'Арвен',
  values: { хиты: 20, яд: false, ...values },
  has: [], effects: worn.map(effectId => ({ effectId })),
} as unknown as Sheet);

const world = { system, compendium: { records: [] }, die: () => 3 };

group('шина моментов', () => {
  test('момент разбирается по имени, чужое слово — не момент', () => {
    eq(momentOf('moment:turn-start'), 'turn-start');
    eq(momentOf('moment:нет-такого'), null);
    eq(momentOf('event:damage'), null);
    eq(momentOf(undefined), null);
    ok(Object.keys(MOMENTS).length >= 8);
  });

  test('яд в начале хода списывает хиты у того, на ком висит', () => {
    const sheets = [sheet(['отравление']), { ...sheet([]), id: 'б', name: 'Мирра' }];
    const out = fireMoments([{ moment: 'turn-start', sheetId: 'а' }], sheets, world as never);
    eq(out.sheets.find(s => s.id === 'а')!.values.хиты, 17);
    eq(out.sheets.find(s => s.id === 'б')!.values.хиты, 20, 'на другом листе ничего не сработало');
    eq(out.reports.length, 1);
    eq(out.reports[0]!.report.kind, 'moment');
  });

  test('чужой момент не будит подписку другого момента', () => {
    const out = fireMoments([{ moment: 'turn-end', sheetId: 'а' }], [sheet(['отравление'])], world as never);
    eq(out.sheets[0]!.values.хиты, 20);
    eq(out.reports.length, 0);
  });

  test('на одном листе срабатывают все подходящие, по очереди', () => {
    const out = fireMoments([{ moment: 'turn-start', sheetId: 'а' }],
      [sheet(['отравление', 'отравление'])], world as never);
    eq(out.sheets[0]!.values.хиты, 14);
    eq(out.reports.length, 2);
  });

  test('условие на срабатывании проверяется', () => {
    const picky = structuredClone(system) as System;
    (picky.effects.отравление as Effect).on![0]!.if = { expr: '@ходит == @носитель and @носитель.яд' };
    const ctx = { ...world, system: picky };
    eq(fireMoments([{ moment: 'turn-start', sheetId: 'а' }], [sheet(['отравление'])], ctx as never)
      .sheets[0]!.values.хиты, 20, 'яда нет — молчит');
    eq(fireMoments([{ moment: 'turn-start', sheetId: 'а' }], [sheet(['отравление'], { яд: true })], ctx as never)
      .sheets[0]!.values.хиты, 17, 'яд есть — сработало');
  });

  test('сорок копий эффекта — сорок законных срабатываний, а не «без остановки»', () => {
    const many = Array.from({ length: 40 }, () => 'отравление');
    const out = fireMoments([{ moment: 'turn-start', sheetId: 'а' }], [sheet(many)], world as never);
    eq(out.reports.length, 40);
  });
});

group('образец D&D: спасброски от смерти', () => {
  const dnd = SAMPLE_WORLDS[0]!.system as System;
  const book = SAMPLE_WORLDS[0]!.compendium as Compendium;

  const dying = (hp: number, roll: number) => {
    const base = (SAMPLE_WORLDS[0]!.sheets as Sheet[]).find(s => s.id === 'arven')!;
    const sheet = {
      ...base,
      values: { ...base.values, hp_current: hp, death_ok: 0, death_fail: 0 },
      effects: [{ effectId: 'dying' }],
    } as Sheet;
    const out = fireMoments([{ moment: 'turn-start', sheetId: 'arven' }], [sheet],
      { system: dnd, compendium: book, die: () => roll } as never);
    return out.sheets[0]!.values;
  };

  test('на нуле хитов бросок идёт: десятка — успех, тройка — провал', () => {
    eq(dying(0, 15).death_ok, 1);
    eq(dying(0, 15).death_fail, 0);
    eq(dying(0, 3).death_fail, 1);
    eq(dying(0, 3).death_ok, 0);
  });

  test('единица на кости — сразу два провала', () => {
    eq(dying(0, 1).death_fail, 2);
  });

  test('пока хиты есть, никто не бросает', () => {
    eq(dying(5, 1).death_fail, 0);
    eq(dying(5, 1).death_ok, 0);
  });
});

group('поле стало верным', () => {
  const watched = {
    id: 'п', name: 'п',
    tables: { лист: { shape: 'single', columns: [
      { key: 'хиты', label: 'Хиты', kind: 'number', default: 20 },
      { key: 'без_сил', label: 'Без сил', expr: { expr: '#хиты <= 0' } },
    ] } },
    effects: {
      без_сознания: { label: 'Без сознания', activation: 'passive', duration: { kind: 'permanent' }, modifiers: [] },
      падение: {
        label: 'Падение', activation: 'passive',
        on: [{ on: 'field:без_сил', if: { expr: '@лист == @носитель' }, steps: [{ type: 'status', mode: 'apply', effect: 'без_сознания', to: { expr: '@носитель' } }] }],
      },
    },
    grants: ['падение'],
  } as unknown as System;
  const ctx = { system: watched, compendium: { records: [] }, die: () => 3 };
  const with_ = (hp: number, worn: string[] = []): Sheet => ({
    id: 'а', systemId: 'п', name: 'Арвен', values: { хиты: hp },
    has: [], effects: worn.map(effectId => ({ effectId })),
  } as unknown as Sheet);

  test('было ложно, стало истинно — подписка срабатывает один раз', () => {
    const out = fireCrossings([with_(5)], [with_(0)], ctx as never);
    eq(out.reports.length, 1);
    eq(out.sheets[0]!.effects.map(e => e.effectId).join(), 'без_сознания');
    eq(out.reports[0]!.report.kind, 'moment');
  });

  test('было истинно и осталось — не срабатывает; стало ложно — тоже', () => {
    eq(fireCrossings([with_(0)], [with_(-3)], ctx as never).reports.length, 0);
    eq(fireCrossings([with_(0)], [with_(7)], ctx as never).reports.length, 0);
  });

  test('лист, которого раньше не было, не считается пересёкшим порог', () => {
    eq(fireCrossings([], [with_(0)], ctx as never).reports.length, 0);
  });

  test('ссылка на поле в подписке разбирается', () => {
    eq(fieldOf('field:без_сил'), 'без_сил');
    eq(fieldOf('moment:turn-start'), null);
    eq(fieldOf(undefined), null);
  });
});
