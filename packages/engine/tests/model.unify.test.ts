import { describe, it, expect } from 'vitest';
import { unifyRecordRefs, unifyWorld } from '../src/model/unify.ts';
import type { System, Compendium } from '../src/model/types.ts';

const world = () => ({
  fields: [], constants: {}, rolls: [],
  effects: {
    hit: {
      label: 'Удар', activation: 'manual', params: [],
      steps: [
        { id: 'n', type: 'amount', source: 'roll', dice: { prop: 'кость' } },
        { type: 'apply', target: { tag: 'хиты' }, value: { ref: 'n' } },
      ],
    },
  },
  records: {
    weapon: {
      kind: 'item', label: 'Оружие',
      props: [{ key: 'кость', label: 'Кость урона', kind: 'dice' }],
      bindings: [{ label: 'Удар', effect: 'hit', args: {} }],
    },
  },
}) as unknown as System;

describe('unifyRecordRefs', () => {
  it('переносит прямое свойство в потребность и закрывает её в привязке', () => {
    const next = unifyRecordRefs(world());
    const effect = next.effects.hit!;
    expect(effect.params).toEqual([{ key: 'кость', label: 'Кость урона', kind: 'dice' }]);
    expect((effect.steps![0] as any).dice).toEqual({ param: 'кость' });
    expect((next.records!.weapon!.bindings![0] as any).args)
      .toEqual({ кость: { prop: 'кость' } });
  });

  it('вход не мутируется; чистая система возвращается как есть', () => {
    const source = world();
    const before = JSON.stringify(source);
    const next = unifyRecordRefs(source);
    expect(JSON.stringify(source)).toBe(before);
    expect(unifyRecordRefs(next)).toBe(next);
  });

  it('занятый ключ получает суффикс', () => {
    const source = world();
    (source.effects.hit as any).params = [{ key: 'кость', label: 'другая', kind: 'number' }];
    const next = unifyRecordRefs(source);
    expect((next.effects.hit!.steps![0] as any).dice).toEqual({ param: 'кость_2' });
    expect(next.effects.hit!.params!.map(p => p.key)).toEqual(['кость', 'кость_2']);
  });

  // Комментарий у walkSlots обещает «этаж ниже» — то есть один уровень
  // составного слота (roll.bonus). Код рекурсирует без ограничения глубины:
  // фиксируем фактическое поведение, а не то, что написано в комментарии.
  it('уходит глубже одного этажа — составной слот с вложенным составным всё равно переносится', () => {
    const source = world();
    delete (source.effects.hit!.steps![0] as any).dice;
    (source.effects.hit!.steps![0] as any).roll = { bonus: { prop: 'кость' } };
    const next = unifyRecordRefs(source);
    expect((next.effects.hit!.steps![0] as any).roll.bonus).toEqual({ param: 'кость' });

    // Ещё на этаж глубже, синтетически: подтверждает, что предел — не 1.
    const deeper = world();
    delete (deeper.effects.hit!.steps![0] as any).dice;
    (deeper.effects.hit!.steps![0] as any).roll = { bonus: { nested: { prop: 'кость' } } };
    const nextDeeper = unifyRecordRefs(deeper);
    expect((nextDeeper.effects.hit!.steps![0] as any).roll.bonus.nested).toEqual({ param: 'кость' });
  });
});

describe('unifyWorld', () => {
  const worldWithItemActivity = () => ({
    system: world(),
    compendium: {
      items: [{
        id: 'trusty-dagger', rk: 'weapon', label: 'Верный кинжал',
        props: { кость: '1d4' },
        // Своя активность перебивает привязку рода (см. bindingsOf), и до
        // миграции звала эффект напрямую — привязки рода ей не хватало.
        activities: [{ label: 'Удар', effect: 'hit', args: {} }],
      }],
      actions: [],
    },
  }) as unknown as { system: System; compendium: Compendium };

  it('заполняет args СОБСТВЕННОЙ активности записи компендиума, не только привязки рода', () => {
    const next = unifyWorld(worldWithItemActivity());
    expect((next.system.effects.hit!.steps![0] as any).dice).toEqual({ param: 'кость' });
    const activity = (next.compendium.items![0]!.activities as any[])[0]!;
    expect(activity.args).toEqual({ кость: { prop: 'кость' } });
    // Привязка рода закрывается тем же приёмом — unifySystem её не потерял.
    expect((next.system.records!.weapon!.bindings![0] as any).args).toEqual({ кость: { prop: 'кость' } });
  });

  it('заполняет args однобиндингового ярлыка record.effect/record.args у action-записи', () => {
    const src = {
      system: world(),
      compendium: {
        items: [],
        actions: [{ id: 'poison-splash', label: 'Ядовитые брызги', effect: 'hit', args: {} }],
      },
    } as unknown as { system: System; compendium: Compendium };

    const next = unifyWorld(src);
    const action = next.compendium.actions![0]! as any;
    expect(action.args).toEqual({ кость: { prop: 'кость' } });
  });

  it('не трогает уже заполненный аргумент активности', () => {
    const src = worldWithItemActivity();
    (src.compendium.items![0]!.activities as any[])[0]!.args = { кость: { const: '2d6' } };
    const next = unifyWorld(src);
    const activity = (next.compendium.items![0]!.activities as any[])[0]!;
    expect(activity.args).toEqual({ кость: { const: '2d6' } });
  });

  it('идемпотентна и не мутирует вход', () => {
    const src = worldWithItemActivity();
    const before = JSON.stringify(src);
    const once = unifyWorld(src);
    expect(JSON.stringify(src)).toBe(before);
    const twice = unifyWorld(once);
    expect(twice.system).toBe(once.system);
    expect(twice.compendium).toBe(once.compendium);
  });

  it('компендиум без вызовов затронутого эффекта возвращается тем же значением', () => {
    const src = { system: world(), compendium: { items: [], actions: [] } } as unknown as
      { system: System; compendium: Compendium };
    const next = unifyWorld(src);
    expect(next.compendium).toBe(src.compendium);
  });
});
