// Схема проверяется на ЖИВЫХ данных, а не на выдуманных: образцовые миры
// из движка обязаны проходить её без правок. Иначе схема описывает не то,
// что у нас есть, и первым это заметит сервер — отказом принять мир.

import { describe, it, expect } from 'vitest';
import { world as W, api } from '../src/index.ts';

// @ts-expect-error — образцы лежат в пакете движка, деклараций не имеют.
import { SAMPLE_SYSTEMS } from '../../engine/src/model/systems.ts';
// @ts-expect-error
import { sheets } from '../../engine/src/model/sheets.ts';
// @ts-expect-error
import { compendium } from '../../engine/src/model/compendium.ts';
// @ts-expect-error
import { migrateWorld } from '../../engine/src/model/migrate.ts';

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
    // Мост между старым и новым: v1-мир не обязан проходить схему сам,
    // но обязан проходить её ПОСЛЕ миграции — иначе старые миры не открыть.
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

    // Клиент не диктует, сколько снять: он просит применить действие.
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
