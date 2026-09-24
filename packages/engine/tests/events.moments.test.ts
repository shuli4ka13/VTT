import { group, test, eq, ok, throws } from './harness.ts';
import { fireMoments, fireCrossings, fieldOf, momentOf, MOMENTS } from '../src/events/moments.ts';
import { PLAYABLE_WORLDS as SAMPLE_WORLDS } from '../src/model/systems.ts';
import type { System, Sheet, Effect, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  fields: [
    { tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } },
    { tag: 'яд', label: 'Отравлен', value: { kind: 'stored', type: 'boolean', default: false } },
  ],
  effects: {
    отравление: {
      label: 'Отравление', activation: 'passive',
      on: [{ on: 'moment:turn-start', steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { const: 3 } }] }],
    },
    передышка: {
      label: 'Передышка', activation: 'passive',
      on: [{ on: 'moment:turn-end', steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'add', value: { const: 1 } }] }],
    },
    кнопка: { label: 'Кнопка', activation: 'manual', steps: [] },
  },
} as unknown as System;

const sheet = (worn: string[], values: Record<string, unknown> = {}): Sheet => ({
  id: 'а', systemId: 'x', kind: 'pc', name: 'Арвен',
  values: { хиты: 20, яд: false, ...values },
  equipped: [], actions: [], effects: worn.map(effectId => ({ effectId })),
} as unknown as Sheet);

const world = { system, compendium: { items: [], actions: [] }, die: () => 3 };

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

  test('чужой момент не будит слушателя другого момента', () => {
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
    (picky.effects.отравление as Effect).on![0]!.if = { expr: '#яд' };
    const ctx = { ...world, system: picky };
    eq(fireMoments([{ moment: 'turn-start', sheetId: 'а' }], [sheet(['отравление'])], ctx as never)
      .sheets[0]!.values.хиты, 20, 'яда нет — молчит');
    eq(fireMoments([{ moment: 'turn-start', sheetId: 'а' }], [sheet(['отравление'], { яд: true })], ctx as never)
      .sheets[0]!.values.хиты, 17, 'яд есть — сработало');
  });

  test('бесконечный каскад обрывается внятной ошибкой', () => {
    const many = Array.from({ length: 40 }, () => 'отравление');
    throws(() => fireMoments([{ moment: 'turn-start', sheetId: 'а' }], [sheet(many)], world as never),
      'без остановки');
  });

  test('активируемый эффект моментом не будится', () => {
    const manual = structuredClone(system) as System;
    (manual.effects.кнопка as Effect).trigger = { on: 'moment:turn-start' } as never;
    const out = fireMoments([{ moment: 'turn-start', sheetId: 'а' }], [sheet(['кнопка'])],
      { ...world, system: manual } as never);
    eq(out.reports.length, 0);
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
    fields: [
      { tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } },
      { tag: 'без_сил', label: 'Без сил', value: { kind: 'formula', expr: '#хиты <= 0' } },
    ],
    effects: {
      без_сознания: { label: 'Без сознания', activation: 'passive', duration: { kind: 'temporary' }, modifiers: [] },
      падение: {
        label: 'Падение', activation: 'passive',
        on: [{ on: 'field:без_сил', steps: [{ type: 'status', mode: 'apply', effect: { const: 'без_сознания' } }] }],
      },
    },
    room_rules: ['падение'],
  } as unknown as System;
  const ctx = { system: watched, compendium: { items: [], actions: [] }, die: () => 3 };
  const with_ = (hp: number, worn: string[] = []): Sheet => ({
    id: 'а', systemId: 'п', kind: 'pc', name: 'Арвен', values: { хиты: hp },
    equipped: [], actions: [], effects: worn.map(effectId => ({ effectId })),
  } as unknown as Sheet);

  test('было ложно, стало истинно — слушатель срабатывает один раз', () => {
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

  test('ссылка на поле в слушателе разбирается', () => {
    eq(fieldOf('field:без_сил'), 'без_сил');
    eq(fieldOf('moment:turn-start'), null);
    eq(fieldOf(undefined), null);
  });
});
