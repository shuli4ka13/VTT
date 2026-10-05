import { describe, it, expect } from 'vitest';
import { lintSystem } from '../src/model/lint.ts';
import { misfit, fieldOf } from '../src/model/sheet-columns.ts';
import { viewNeeds, viewsFor } from '../src/model/views.ts';
import type { System } from '../src/model/types.ts';

const system = (columns: unknown[]): System => ({
  id: 'x', name: 'x', effects: {},
  tables: { лист: { shape: 'single', owner: 'sheet', columns } },
} as unknown as System);

describe('виды полей: что обязательно и что к какому типу', () => {
  it('точкам и полосе нужен верх, ползунку — ещё и низ, кружку — таблица вариантов', () => {
    expect(viewNeeds('pips', {})).toEqual(['верх']);
    expect(viewNeeds('slider', { max: 5 })).toEqual(['низ']);
    expect(viewNeeds('ring', { kind: 'choice' })).toEqual(['таблица вариантов']);
    expect(viewNeeds('ring', { kind: 'boolean' })).toEqual([]);
    expect(viewNeeds('ring', { kind: 'number', min: 0 })).toEqual(['верх']);
    expect(viewNeeds('choice', { kind: 'number', min: 0, max: 20 })).toEqual(['не больше 8 ступеней']);
    expect(viewNeeds('signed', {})).toEqual([]);
  });

  it('переключатель — только у «да/нет»; кружок и кнопки — у выбора, «да/нет» и числа; посчитанному — тоже', () => {
    expect(viewsFor('number', false)).not.toContain('toggle');
    expect(viewsFor('number', false)).toContain('ring');
    expect(viewsFor('boolean', false)).toEqual(['toggle', 'ring', 'choice']);
    expect(viewsFor('choice', false)).toEqual(['ring', 'choice']);
    expect(viewsFor('number', true)).toContain('ring');
  });

  it('линт предупреждает о виде без верха и о виде не к типу', () => {
    const found = lintSystem(system([
      { key: 'запас', label: 'Запас', kind: 'number', control: { kind: 'pips' } },
      { key: 'бой', label: 'Бой', kind: 'number', control: { kind: 'toggle' } },
      { key: 'хиты', label: 'Хиты', kind: 'number', max: 10, control: { kind: 'bar' } },
    ])).filter(p => /виду|не подходит/.test(p.text)).map(p => p.text);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatch(/«Запас».*Точки.*верх/);
    expect(found[1]).toMatch(/«Бой».*Переключатель.*не подходит/);
  });
});

describe('запись в поле проверяет тип', () => {
  const s = system([
    { key: 'бой', label: 'Идёт бой', kind: 'boolean' },
    { key: 'хиты', label: 'Хиты', kind: 'number' },
    { key: 'сопр', label: 'Сопротивления', kind: 'choice', from: 'урон', many: true },
  ]);
  it('число в «да/нет» и список в одиночное поле — отказ; своё и пусто — можно', () => {
    expect(misfit(fieldOf(s, 'бой')!, 1)).toMatch(/да или нет/);
    expect(misfit(fieldOf(s, 'бой')!, true)).toBeNull();
    expect(misfit(fieldOf(s, 'хиты')!, 'много')).toMatch(/число/);
    expect(misfit(fieldOf(s, 'хиты')!, null)).toBeNull();
    expect(misfit(fieldOf(s, 'сопр')!, 'огонь')).toMatch(/список/);
    expect(misfit(fieldOf(s, 'сопр')!, ['огонь'])).toBeNull();
  });
});
