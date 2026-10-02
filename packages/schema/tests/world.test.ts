import { describe, it, expect } from 'vitest';
import { world as W, api } from '../src/index.ts';

// @ts-expect-error — образцы лежат в пакете движка, деклараций не имеют.
import { SAMPLE_SYSTEMS, SAMPLE_WORLDS } from '../../engine/src/model/systems.ts';

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

  it('все образцовые листы проходят схему', () => {
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
  it('вычисленное значение в лист не проходит — это критерий №1', () => {
    const bad = {
      ...sheets[0],
      values: { ...sheets[0].values, computed: { total: 12 } },
    };
    expect(W.sheet.safeParse(bad).success, 'объект вместо скаляра обязан быть отвергнут')
      .toBe(false);
  });

  it('лишний ключ верхнего уровня в лист не проходит', () => {
    const bad = { ...sheets[0], cache: {} };
    expect(W.sheet.safeParse(bad).success).toBe(false);
  });

  it('копия записи вместо ссылки не проходит', () => {
    const bad = { ...sheets[0], has: [{ id: 'sword', label: 'Меч' }] };
    expect(W.sheet.safeParse(bad).success, 'в has лежат ссылки { of }, а не копии записей').toBe(false);
  });

  it('двоеточие в теге поля запрещено — им размечены выведенные мишени', () => {
    const bad = {
      tables: { лист: { shape: 'single', columns: [{ key: 'check:str', label: 'Плохой', kind: 'number' }] } },
      effects: {},
    };
    expect(W.system.safeParse(bad).success).toBe(false);
  });

  it('незнакомые ключи системы сохраняются: мир из чужой версии не теряет данных', () => {
    const withExtra = { ...SAMPLE_SYSTEMS[0], futureSection: { hello: 'world' } };
    const parsed = W.system.parse(withExtra);
    expect((parsed as Record<string, unknown>).futureSection).toEqual({ hello: 'world' });
  });

  it('состав кости: счёт — число или формула, но не свободный текст', () => {
    const die = (count: unknown) =>
      W.dieConstant.safeParse({ kind: 'die', dice: [{ count, sides: 6 }] }).success;
    expect(die(4), 'литеральный счёт').toBe(true);
    expect(die({ expr: 'большее из(1, @rating)' }), 'пул из листа — Shadowrun, Blades').toBe(true);
    expect(die('4'), 'строка счётом не бывает — это дыра черновика').toBe(false);
    expect(die({ tag: 'pool' }), 'старая ссылка на поле').toBe(false);
  });

  it('правка броска называет ЗАПИСЬ словаря; поле-модификатор не правит бросок и вызов', () => {
    const mod = (extra: object) =>
      W.modifier.safeParse({ kind: 'edit', call: 'roll', param: 'edits', ...extra }).success;
    expect(mod({ edit: 'преимущество' }), 'ссылка на запись словаря').toBe(true);
    expect(mod({ param: 'bonus', op: 'add', value: { expr: '5' } }), 'числовая прибавка — тоже правка броска').toBe(true);
    expect(mod({ param: 'bonus', op: 'add', value: 5 }), 'значение — формула, голое число не принимается').toBe(false);
    for (const target of ['roll:any', 'incoming:roll:any', 'event:damage']) {
      expect(W.modifier.safeParse({ kind: 'value', target, op: 'add', value: { expr: '1' } }).success, target).toBe(false);
    }
    expect(W.modifier.safeParse({ kind: 'roll', target: 'roll:any', edit: 'преимущество' }).success, 'старой породы больше нет').toBe(false);
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
  it('лист переживает JSON → схема → JSON без изменений', () => {
    for (const sheet of sheets) {
      const once = JSON.parse(JSON.stringify(sheet));
      const parsed = W.sheet.parse(once);
      expect(JSON.stringify(parsed)).toBe(JSON.stringify(once));
    }
  });

});

describe('контракты клиент ↔ сервер', () => {
  it('намерение хода принимается, а «готовый результат» — нет', () => {
    expect(api.actIntent.safeParse({
      roomId: 'r1', actionId: 'sword:0', fromId: 'arven', toIds: ['mirra'],
    }).success).toBe(true);

    expect(api.actIntent.safeParse({
      roomId: 'r1', actionId: 'sword:0', fromId: 'arven', toIds: ['mirra'], damage: 9,
    }).success, 'лишние поля намерения игнорируются, а не принимаются как истина')
      .toBe(true);
    expect(api.actIntent.parse({
      roomId: 'r1', actionId: 'sword:0', fromId: 'arven', toIds: ['mirra'], damage: 9,
    })).toEqual({ roomId: 'r1', actionId: 'sword:0', fromId: 'arven', toIds: ['mirra'] });
  });

  it('намерение может нести заявки правок броска — по листам', () => {
    const parsed = api.actIntent.parse({
      roomId: 'r1', actionId: 'sword:0', fromId: 'arven', toIds: ['mirra'],
      claims: { arven: ['advantage'], mirra: ['disadvantage'] },
    });
    expect(parsed.claims).toEqual({ arven: ['advantage'], mirra: ['disadvantage'] });
    expect(api.actIntent.safeParse({
      roomId: 'r1', actionId: 'sword:0', fromId: 'arven', toIds: ['mirra'], claims: { arven: [''] },
    }).success, 'пустой ключ правки — не заявка').toBe(false);
  });

  it('часы комнаты и команда хода описаны схемой', () => {
    expect(api.clockState.safeParse({ round: 0, order: [], active: null, spent: {} }).success).toBe(true);
    expect(api.turnIntent.safeParse({ roomId: 'r', op: 'start' }).success).toBe(true);
    expect(api.turnIntent.safeParse({ roomId: 'r', op: 'next', order: ['a'] }).success).toBe(true);
    expect(api.turnIntent.safeParse({ roomId: 'r', op: 'котик' }).success).toBe(false);
    expect(api.clientMessage.safeParse({ type: 'room:turn', intent: { roomId: 'r', op: 'stop' } }).success).toBe(true);
  });

  it('пауза стола и ответ игрока описаны схемой', () => {
    expect(api.pendingState.safeParse({
      id: 'p1', sheetId: 'arven', stage: 'seen', question: '?', options: [{ id: 'shield', label: 'Щит' }], preview: [],
    }).success).toBe(true);
    expect(api.answerIntent.safeParse({ roomId: 'r', pendingId: 'p1', chosen: [] }).success).toBe(true);
    expect(api.answerIntent.safeParse({ roomId: 'r', pendingId: '', chosen: [] }).success).toBe(false);
    expect(api.clientMessage.safeParse({ type: 'room:answer', intent: { roomId: 'r', pendingId: 'p1', chosen: ['shield'] } }).success).toBe(true);
    expect(W.activation.safeParse('passive').success).toBe(true);
    expect(W.activation.safeParse('reaction').success).toBe(false);
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
      { expr: '0' },
      { expr: '"1d6"' },
      { expr: '@цель.dex_save' },
      { expr: 'большее из(1, @rating)' },
      'lead_die',
      'damage',
    ];

    for (const form of forms) {
      const parsed = W.slotRef.parse(form);
      expect(parsed, JSON.stringify(form)).toEqual(form);
    }
  });

  it('старые формы значения — ссылка на шаг, свойство под другим именем, таблица — схему не проходят', () => {
    for (const form of [{ ref: 'hit.success' }, { item: 'damage_dice' }, { table: 't', by: { const: 1 } }, { expr: '1', optional: true },
      { const: 0 }, { tag: 'hp_current' }, { param: 'save' }, { prop: 'damage_dice' }, { constant: 'lead_die' }]) {
      expect(W.slotRef.safeParse(form).success, JSON.stringify(form)).toBe(false);
    }
  });

  it('условие шага — только формула', () => {
    expect(W.formula.safeParse({ expr: '@hit.success' }).success).toBe(true);
    expect(W.formula.safeParse({ ref: 'hit.success', not: true }).success).toBe(false);
  });

  it('образцовые эффекты переживают round-trip без потерь', () => {

    for (const sys of SAMPLE_SYSTEMS) {
      const parsed = W.system.parse(sys);
      expect(parsed.effects, sys.name).toEqual(sys.effects);
    }
  });

  it('условие «когда» доезжает целиком — регрессия «ответка молчит»', () => {
    const thorns = SAMPLE_SYSTEMS
      .flatMap((s: { effects: Record<string, unknown> }) => Object.values(s.effects))
      .find((e: any) => e?.on?.some((h: any) => h.if));
    expect(thorns, 'в образцах есть «когда» с условием').toBeTruthy();

    const parsed = W.effect.parse(thorns);
    expect((parsed as any).on).toEqual((thorns as any).on);
  });
});

describe('аргументы привязок — как их читает движок', () => {
  it('аргумент — формула, как любое значение; старые формы не принимаются', () => {
    const ok = { save: { expr: '@save_by' }, difficulty: { expr: '12' }, source: { expr: '"item"' } };
    expect(W.binding.parse({ effect: 'strike', args: ok }).args).toEqual(ok);
    for (const old of [{ save: { prop: 'save_by' } }, { difficulty: 12 }, { flag: true }]) {
      expect(W.binding.safeParse({ effect: 'strike', args: old }).success).toBe(false);
    }
  });
});

describe('манекены системы', () => {
  it('система может хранить листы-манекены для предпросмотра, необязательно', () => {
    const base = { name: 'x', tables: {}, effects: {} };
    expect(W.system.safeParse(base).success).toBe(true);
    const withDolls = {
      ...base,
      mannequins: [{ id: 'а', systemId: 'x', name: 'А', values: {}, has: [], effects: [] }],
    };
    expect(W.system.safeParse(withDolls).success).toBe(true);
    const broken = { ...base, mannequins: [{ id: 'а', name: 'А', values: { hp: 3 } }] };
    expect(W.system.safeParse(broken).success).toBe(false);
  });
});

describe('цена эффекта', () => {
  it('старое поле self не проходит молча — цена бы потерялась', () => {
    expect(W.effect.safeParse({ label: 'Удар', cost: [] }).success).toBe(true);
    expect(W.effect.safeParse({ label: 'Удар', self: [] }).success).toBe(false);
  });
});
