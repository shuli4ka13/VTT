import { describe, it, expect } from 'vitest';
import { world as W, api } from '../src/index.ts';

// @ts-expect-error — образцы лежат в пакете движка, деклараций не имеют.
import { SAMPLE_SYSTEMS, SAMPLE_WORLDS } from '../../engine/src/model/systems.ts';
// @ts-expect-error
import { migrateWorld } from '../../engine/src/model/migrate.ts';

const { compendium, sheets } = SAMPLE_WORLDS[0];

describe('схема мира на образцовых данных', () => {
  it('обе образцовые системы проходят схему', () => {
    for (const sys of SAMPLE_SYSTEMS) {
      const result = W.system.safeParse(sys);
      expect(result.success, `${sys.name}: ${JSON.stringify(result.error?.issues?.slice(0, 3))}`)
        .toBe(true);
    }
  });

  it('компендиум проходит схему', () => {
    const result = W.compendium.safeParse(compendium);
    expect(result.success, JSON.stringify(result.error?.issues?.slice(0, 3))).toBe(true);
  });

  it('все образцовые чарники проходят схему', () => {
    for (const sheet of sheets) {
      const result = W.sheet.safeParse(sheet);
      expect(result.success, `${sheet.id}: ${JSON.stringify(result.error?.issues?.slice(0, 3))}`)
        .toBe(true);
    }
  });

  it('мир целиком проходит схему', () => {
    const full = { system: SAMPLE_SYSTEMS[0], compendium, sheets };
    expect(W.world.safeParse(full).success).toBe(true);
  });
});

describe('схема стережёт инварианты, а не только форму', () => {
  it('вычисленное значение в чарник не проходит — это критерий №1', () => {
    const bad = {
      ...sheets[0],
      values: { ...sheets[0].values, computed: { total: 12 } },
    };
    expect(W.sheet.safeParse(bad).success, 'объект вместо скаляра обязан быть отвергнут')
      .toBe(false);
  });

  it('лишний ключ верхнего уровня в чарник не проходит', () => {
    const bad = { ...sheets[0], cache: {} };
    expect(W.sheet.safeParse(bad).success).toBe(false);
  });

  it('копия записи вместо ссылки не проходит', () => {
    const bad = { ...sheets[0], equipped: [{ id: 'sword', label: 'Меч' }] };
    expect(W.sheet.safeParse(bad).success, 'в equipped лежат только id').toBe(false);
  });

  it('двоеточие в теге поля запрещено — им размечены выведенные мишени', () => {
    const bad = {
      fields: [{ tag: 'check:str', label: 'Плохой', value: { kind: 'stored', type: 'number', default: 0 } }],
      effects: {},
    };
    expect(W.system.safeParse(bad).success).toBe(false);
  });

  it('незнакомые ключи системы сохраняются: мир из чужой версии не теряет данных', () => {
    const withExtra = { ...SAMPLE_SYSTEMS[0], futureSection: { hello: 'world' } };
    const parsed = W.system.parse(withExtra);
    expect((parsed as Record<string, unknown>).futureSection).toEqual({ hello: 'world' });
  });

  it('состав кости: счёт — число или ссылка на поле, но не свободный текст', () => {
    const die = (count: unknown) =>
      W.dieConstant.safeParse({ kind: 'die', dice: [{ count, sides: 6 }] }).success;
    expect(die(4), 'литеральный счёт').toBe(true);
    expect(die({ tag: 'pool' }), 'пул из листа — Shadowrun, Blades').toBe(true);
    expect(die('4'), 'строка счётом не бывает — это дыра черновика').toBe(false);
  });

  it('roll-модификатор называет ЗАПИСЬ словаря, а не механику', () => {
    const mod = (extra: object) =>
      W.modifier.safeParse({ kind: 'roll', target: 'attack_roll', ...extra }).success;
    expect(mod({ edit: 'преимущество' }), 'ссылка на запись словаря').toBe(true);
    expect(mod({ op: 'add', value: 5 }), 'числовая прибавка — другая порода, но тоже roll').toBe(true);

    expect(mod({ effect: 'advantage', method: 'rerollBest' }), 'старый мир не отвергается').toBe(true);
  });

  it('запись словаря правок: имя автора, примитивы, «гасится»', () => {
    const edit = (value: unknown) => W.rollEdit.safeParse(value).success;
    expect(edit({ label: 'Фора', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }] })).toBe(true);
    expect(edit({ label: 'Помеха', ops: [], canceledBy: 'advantage' }), 'пустая правка — законна').toBe(true);
    expect(edit({ label: 'Кривая', ops: [{ n: 1 }] }), 'примитив без имени — не примитив').toBe(false);
    expect(edit({ label: 'Без списка' }), 'ops обязателен: правка без действий не описана').toBe(false);
  });

  it('чтение кости: имя или объект с kind; мусор не проходит', () => {
    const die = (read: unknown) =>
      W.dieConstant.safeParse({ kind: 'die', dice: [{ sides: 6 }], read }).success;
    expect(die(undefined), 'пусто — сумма по умолчанию').toBe(true);
    expect(die('best')).toBe(true);
    expect(die({ kind: 'count', atLeast: 5 })).toBe(true);
    expect(die(7), 'число чтением не бывает').toBe(false);
    expect(die({ atLeast: 5 }), 'объект без kind — не чтение').toBe(false);
  });
});

describe('round-trip: разбор и сборка не теряют и не добавляют', () => {
  it('чарник переживает JSON → схема → JSON без изменений', () => {
    for (const sheet of sheets) {
      const once = JSON.parse(JSON.stringify(sheet));
      const parsed = W.sheet.parse(once);
      expect(JSON.stringify(parsed)).toBe(JSON.stringify(once));
    }
  });

  it('мир версии 1 после миграции проходит схему нового формата', () => {

    const v1 = {
      system: {
        id: 'legacy', name: 'Старый', fields: [], effects: {},
        rules: { strike: { label: 'Удар', params: [], steps: [] } },
        modifiers: [{ id: 'fog', label: 'Туман', kind: 'roll', target: 'attack_roll', effect: 'disadvantage' }],
      },
      compendium: { items: [], actions: [], effects: [] },
      sheets: [],
    };
    const migrated = migrateWorld(v1);
    const result = W.world.safeParse(migrated);
    expect(result.success, JSON.stringify(result.error?.issues?.slice(0, 3))).toBe(true);
    expect(migrated.system.rules).toBe(undefined);
  });
});

describe('контракты клиент ↔ сервер', () => {
  it('намерение хода принимается, а «готовый результат» — нет', () => {
    expect(api.actIntent.safeParse({
      roomId: 'r1', actionId: 'sword:0', fromId: 'arven', toId: 'mirra',
    }).success).toBe(true);

    expect(api.actIntent.safeParse({
      roomId: 'r1', actionId: 'sword:0', fromId: 'arven', toId: 'mirra', damage: 9,
    }).success, 'лишние поля намерения игнорируются, а не принимаются как истина')
      .toBe(true);
    expect(api.actIntent.parse({
      roomId: 'r1', actionId: 'sword:0', fromId: 'arven', toId: 'mirra', damage: 9,
    })).toEqual({ roomId: 'r1', actionId: 'sword:0', fromId: 'arven', toId: 'mirra' });
  });

  it('пустое действие или пустая цель не проходят', () => {
    expect(api.actIntent.safeParse({ roomId: 'r', actionId: '', fromId: 'a', toId: 'b' }).success).toBe(false);
    expect(api.actIntent.safeParse({ roomId: 'r', actionId: 'x:0', fromId: 'a', toId: '' }).success).toBe(false);
  });

  it('сообщения канала разбираются по типу', () => {
    const msg = api.clientMessage.safeParse({ type: 'room:join', roomId: 'r1', token: 't' });
    expect(msg.success).toBe(true);
    expect(api.clientMessage.safeParse({ type: 'room:unknown' }).success).toBe(false);
  });
});

describe('ссылки слотов не теряются при разборе', () => {
  it('каждая форма ссылки переживает round-trip нетронутой', () => {

    const forms = [
      { const: 0 },
      { const: '1d6' },
      { const: null },
      { expr: '#str_mod' },
      { expr: '#dex_save', of: 'target' as const },
      { tag: 'hp_current' },
      { param: 'save' },
      { prop: 'damage_dice' },
      { item: 'damage_dice' },
      { ref: 'hit.success' },
      { constant: 'lead_die' },
      { prop: 'status', optional: true },
    ];

    for (const form of forms) {
      const parsed = W.slotRef.parse(form);
      expect(parsed, JSON.stringify(form)).toEqual(form);
    }
  });

  it('образцовые эффекты переживают round-trip без потерь', () => {

    for (const sys of SAMPLE_SYSTEMS) {
      const parsed = W.system.parse(sys);
      expect(parsed.effects, sys.name).toEqual(sys.effects);
    }
  });

  it('условие триггера доезжает целиком — регрессия «ответка молчит»', () => {
    const thorns = SAMPLE_SYSTEMS
      .flatMap((s: { effects: Record<string, unknown> }) => Object.values(s.effects))
      .find((e: any) => e?.trigger?.condition);
    expect(thorns, 'в образцах есть эффект с условием триггера').toBeTruthy();

    const parsed = W.effect.parse(thorns);
    expect((parsed as any).trigger.condition).toEqual((thorns as any).trigger.condition);
  });
});

describe('аргументы привязок — как их читает движок', () => {
  it('готовое значение и { prop } проходят одинаково', () => {

    const forms = [
      { save: { prop: 'save_by' } },
      { bonus: '#combat', difficulty: 12, source: 'item' },
      { flag: true, nothing: null },
    ];
    for (const args of forms) {
      const parsed = W.binding.parse({ effect: 'strike', args });
      expect(parsed.args).toEqual(args);
    }
  });
});
