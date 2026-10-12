import { describe, it, expect } from 'vitest';
import { perform } from '../src/core/perform.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { isTagWord } from '../src/engine/roll-tags.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = flattenSystem({
  id: 'с', name: 'с',
  constants: { pool: { label: 'набор к6', kind: 'die', dice: [{ count: 1, sides: 6 }], read: { kind: 'count', atLeast: 5 } } },
  roll_edits: { wild: { label: 'Дикий кубик', ops: [{ op: 'wild' }] } },
  tags: {},
  tables: {
    rolls: { label: 'Броски', key: 'word', columns: [], rows: [{ value: 'проверка' }, { value: 'зрение' }, { value: 'ближний бой' }] },
    лист: { shape: 'single', owner: 'sheet', columns: [
      { key: 'ловкость', label: 'Ловкость', kind: 'number', default: 3,
        stages: [{ key: 'аугментация', upTo: 4 }],
        roll: { label: 'Ловкость', die: 'pool', count: { expr: '@ловкость' }, tags: ['проверка'] } },
    ] },
    навыки: { label: 'Навыки', key: 'word', owner: 'sheet', columns: [
      { key: 'rank', label: 'Уровень', kind: 'number', default: 0 },
      { key: 'pool', label: 'Набор', kind: 'number', expr: { expr: '@строка.rank + 2' },
        roll: { label: 'Проверка: {label}', die: 'pool', count: { expr: '@строка.pool' }, tags: ['проверка', '{value}'] } },
    ], rows: [{ value: 'ближний бой' }, { value: 'внимание' }] },
    имплант: { shape: 'book', use: 'item', label: 'Имплант', columns: [
      { key: 'skill', label: 'Навык', kind: 'choice', from: 'навыки' },
      { key: 'rating', label: 'Рейтинг', kind: 'number' },
    ], modifiers: [{ kind: 'value', target: 'навыки.{@строка.skill}.rank', op: 'add', value: { expr: '@строка.rating' } }] },
    оптика: { shape: 'book', use: 'item', label: 'Оптика', columns: [{ key: 'rating', label: 'Рейтинг', kind: 'number' }],
      modifiers: [{ kind: 'edit', call: 'roll', param: 'count', op: 'add', value: { expr: '@строка.rating' }, tags: ['зрение'] }] },
    мускулы: { shape: 'book', use: 'item', label: 'Мускулы', columns: [{ key: 'rating', label: 'Рейтинг', kind: 'number' }],
      modifiers: [{ kind: 'value', target: 'ловкость', op: 'add', value: { expr: '@строка.rating' } }] },
  },
  effects: {
    помпа: { label: 'Помпа', activation: 'passive', duration: { kind: 'rounds', max: { expr: '@r * 2' } },
      params: [{ key: 'r', label: 'Рейтинг', kind: 'number', default: 2 }] },
  },
} as unknown as System);

const book = { records: [
  { id: 'датчик', table: 'имплант', label: 'Датчик рефлексов', cells: { rating: 2 } },
  { id: 'глаз', table: 'оптика', label: 'Глаз', cells: { rating: 2 } },
  { id: 'мышцы', table: 'мускулы', label: 'Мышцы', cells: { rating: 6 } },
] } as unknown as Compendium;

const hero = (has: Sheet['has'] = [], values: Record<string, unknown> = {}): Sheet =>
  ({ id: 'г', systemId: 'с', name: 'Герой', values, has, effects: [] } as unknown as Sheet);
const at = (sheet: Sheet, tag: string) => calc(system, sheet, tag, newPass(system, sheet, { compendium: book }));
const tape = (...faces: number[]) => { const rest = [...faces]; return () => rest.shift() ?? 1; };
const roll = (sheet: Sheet, tag: string, faces: number[], claims?: string[]) => {
  const out = perform({ system, compendium: book, clock: null, sheets: [sheet], die: tape(...faces) },
    { op: 'roll', sheetId: 'г', tag, ...(claims ? { claims } : {}) } as never);
  if (out.kind !== 'done') throw new Error(out.kind);
  return out.log.join('\n');
};

describe('метки и правки броска для наборов к6', () => {
  it('метка с пробелом — слово метки; навык несёт свою метку подстановкой', () => {
    expect(isTagWord('ближний бой')).toBe(true);
    expect(errorsOf(lintSystem(system, book)).map(p => p.text)).toEqual([]);
  });

  it('«+N кубиков»: правка вызова «Бросок → кубики» добавляет кости в набор, количество — у вещи', () => {
    const log = roll(hero([{ of: 'глаз' }]), 'навыки.внимание.pool', [6, 6, 6, 6], ['зрение']);
    expect(log).toMatch(/\[6, 6, 6, 6\]/);
    expect(log).toMatch(/успехов: 4/);
  });

  it('заявка — метка обстоятельства: без заявленного «зрения» прибавки нет', () => {
    const log = roll(hero([{ of: 'глаз' }]), 'навыки.внимание.pool', [6, 6, 6, 6]);
    expect(log).toMatch(/\[6, 6\]/);
  });
});

describe('цель правки из свойства экземпляра', () => {
  it('«Датчик рефлексов (навык)»: прибавка идёт в выбранный навык, пустой выбор — молчит', () => {
    expect(at(hero([{ of: 'датчик', values: { skill: 'ближний бой' } }]), 'навыки.ближний_бой.rank')).toBe(2);
    expect(at(hero([{ of: 'датчик', values: { skill: 'ближний бой' } }]), 'навыки.внимание.rank')).toBe(0);
    expect(at(hero([{ of: 'датчик' }]), 'навыки.ближний_бой.rank')).toBe(0);
  });
});

describe('относительный предел этапа', () => {
  it('аугментация: не больше естественной + 4', () => {
    expect(at(hero([{ of: 'мышцы' }], { ловкость: 3 }), 'ловкость')).toBe(7);
    expect(at(hero([{ of: 'мышцы', values: { rating: 2 } }], { ловкость: 3 }), 'ловкость')).toBe(5);
  });
});

describe('срок висящего эффекта формулой', () => {
  it('«рейтинг × 2» раундов от входа эффекта', () => {
    const sheet = hero();
    const out = perform({ system, compendium: book, clock: { round: 3, order: ['г'], active: 'г' }, sheets: [sheet], die: () => 1 },
      { op: 'belonging', sheetId: 'г', list: 'effects', id: 'помпа', on: true } as never);
    if (out.kind !== 'done') throw new Error(out.kind);
    expect(out.sheets[0]!.effects[0]).toMatchObject({ effectId: 'помпа', until: 7 });
  });
});

describe('дикий кубик', () => {
  it('дикий 5–6 — три успеха', () => {
    expect(roll(hero(), 'ловкость', [6, 5, 1], ['wild'])).toMatch(/успехов: 4/);
  });

  it('дикая единица гасит пятёрки, шестёрки остаются', () => {
    expect(roll(hero(), 'ловкость', [1, 5, 6], ['wild'])).toMatch(/успехов: 1/);
  });
});
