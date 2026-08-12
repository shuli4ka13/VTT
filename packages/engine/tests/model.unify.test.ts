import { describe, it, expect } from 'vitest';
import { unifyRecordRefs } from '../src/model/unify.ts';
import type { System } from '../src/model/types.ts';

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
});
