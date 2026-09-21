import { describe, it, expect } from 'vitest';
import { pathWords, pickFor, whereLabel } from './problems.ts';
import type { System } from '@vtt/schema';

const system = {
  name: 'x',
  fields: [{ tag: 'hp', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 1 } }],
  effects: { hit: { label: 'Удар', activation: 'manual', steps: [] } },

  records: { weapon: { kind: 'item', label: 'Оружие' } },
} as unknown as System;

describe('пути схемы переводятся в слова экрана', () => {
  it('эффект, шаг, кость', () => {
    expect(pathWords('effects.hit.steps.0.roll.die: Required', system)).toBe('эффект «Удар» · шаг 1 · бросок · кость: не заполнено');
  });

  it('поле по номеру — с подписью, срабатывание — словами', () => {
    expect(pathWords('fields.0.label: Too small', system)).toBe('поле «Хиты» · название: пусто');
    expect(pathWords('effects.hit.trigger.on: Invalid input', system)).toBe('эффект «Удар» · что слушает · что слушает: не то значение');
  });

  it('незнакомое — как есть, но с переводом сообщения', () => {
    expect(pathWords('records.weapon.bindings.1.args: Required', system)).toBe('тип записи «Оружие» · привязка 2 · что берёт из записи: не заполнено');
    expect(pathWords('без двоеточия', system)).toBe('без двоеточия');
  });
});

describe('адрес проблемы открывает нужное место', () => {
  it('шаг эффекта → вкладка «Эффекты», эффект и шаг', () => {
    expect(pickFor({ tab: 'effects', effect: 'hit', step: 2 })).toEqual({ activeTab: 'effects', activeEffectId: 'hit', activeStepIndex: 2 });
  });

  it('поле → вкладка «Лист» и поле', () => {
    expect(pickFor({ tab: 'sheet', field: 'hp' })).toEqual({ activeTab: 'sheet', activeFieldTag: 'hp', activeStepIndex: null });
  });

  it('тип записи и правила', () => {
    expect(pickFor({ tab: 'records', kind: 'weapon' })).toMatchObject({ activeTab: 'records', activeRecordKind: 'weapon' });
    expect(pickFor({ tab: 'rules', section: 'room_rules' })).toMatchObject({ activeTab: 'dictionaries' });
  });

  it('подпись места — словами системы', () => {
    expect(whereLabel({ tab: 'effects', effect: 'hit', step: 0 }, system)).toBe('Эффекты · эффект «Удар» · шаг 1');
    expect(whereLabel({ tab: 'rules', section: 'room_rules' }, system)).toBe('Правила · правила комнаты');
    expect(whereLabel({ tab: 'records', kind: 'weapon', binding: 0 }, system)).toBe('Типы записей · «Оружие» · привязка 1');
  });
});
