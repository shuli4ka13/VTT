import { describe, it, expect } from 'vitest';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System } from '../src/model/types.ts';

const base = (columns: unknown[], extra: Record<string, unknown> = {}): System => ({
  id: 'старт', name: 'Старт',
  tables: { лист: { shape: 'single', owner: 'sheet', columns }, ...((extra.tables as object) ?? {}) },
  effects: (extra.effects as object) ?? {},
  ...(extra.sample ? { sample: extra.sample } : {}),
}) as unknown as System;

const texts = (system: System, level?: 'error' | 'warn'): string[] =>
  lintSystem(system).filter(problem => !level || problem.level === level).map(problem => problem.text);

describe('«Проблемы»: значение при создании', () => {
  it('число, слово и формула от посчитанного поля — без замечаний', () => {
    const system = base([
      { key: 'уровень', label: 'Уровень', kind: 'number', default: 3 },
      { key: 'хиты_макс', label: 'Максимум хитов', expr: { expr: '10 + @уровень' } },
      { key: 'хиты', label: 'Хиты', kind: 'number', default: { expr: '@хиты_макс' } },
    ]);
    expect(texts(system)).toEqual([]);
  });

  it('круг значений при создании — ошибка, названы оба поля', () => {
    const system = base([
      { key: 'а', label: 'Первое', kind: 'number', default: { expr: '@б' } },
      { key: 'б', label: 'Второе', kind: 'number', default: { expr: '@а + 1' } },
    ]);
    const found = texts(system, 'error').filter(text => text.includes('по кругу'));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('«Первое»');
    expect(found[0]).toContain('«Второе»');
  });

  it('формула называет поле, которого нет, — та же ошибка, что у формулы поля', () => {
    const system = base([{ key: 'хиты', label: 'Хиты', kind: 'number', default: { expr: '@нет_такого' } }]);
    expect(texts(system, 'error').some(text => text.includes('нет_такого'))).toBe(true);
  });

  it('формула у входа эффекта, у колонки справочника и у свойства записи — ошибка', () => {
    const system = base([{ key: 'уровень', label: 'Уровень', kind: 'number' }], {
      tables: {
        ступени: { label: 'Ступени', key: 'word', columns: [{ key: 'цена', label: 'Цена', kind: 'number', default: { expr: '@уровень' } }], rows: [{ value: 'первая' }] },
        оружие: { shape: 'book', use: 'item', label: 'Оружие', columns: [{ key: 'вес', label: 'Вес', kind: 'number', default: { expr: '@уровень' } }] },
      },
      effects: {
        удар: { label: 'Удар', activation: 'manual', params: [{ key: 'сила', label: 'Сила удара', kind: 'number', default: { expr: '@уровень' } }], steps: [] },
      },
    });
    const errors = texts(system, 'error');
    expect(errors.some(text => text.includes('«Цена»') && text.includes('только у поля листа'))).toBe(true);
    expect(errors.some(text => text.includes('«Вес»') && text.includes('только у поля листа'))).toBe(true);
    expect(errors.some(text => text.includes('«Сила удара»') && text.includes('только само значение'))).toBe(true);
  });
});

describe('«Проблемы»: значения образца листа', () => {
  const columns = [
    { key: 'уровень', label: 'Уровень', kind: 'number' },
    { key: 'итог', label: 'Итог', expr: { expr: '@уровень * 2' } },
  ];

  it('значение по своему полю — без замечаний и публикации не мешает', () => {
    const system = base(columns, { sample: { уровень: 7 } });
    expect(texts(system)).toEqual([]);
  });

  it('значение поля, которого нет или которое считается, и значение не того типа — предупреждения', () => {
    const system = base(columns, { sample: { пропало: 1, итог: 4, уровень: 'семь' } });
    expect(errorsOf(lintSystem(system))).toEqual([]);
    const warns = texts(system, 'warn');
    expect(warns.some(text => text.includes('«пропало»'))).toBe(true);
    expect(warns.some(text => text.includes('«итог»'))).toBe(true);
    expect(warns.some(text => text.includes('образец листа') && text.includes('«Уровень»'))).toBe(true);
  });
});

describe('образец листа и переименование строки', () => {
  it('значение образца у клетки строки переезжает вместе со строкой', async () => {
    const { renameRow } = await import('../src/model/integrity.ts');
    const system = {
      id: 'с', name: 'с', effects: {},
      tables: { навыки: { label: 'Навыки', owner: 'sheet', key: 'word', columns: [{ key: 'ранг', label: 'Ранг', kind: 'number' }], rows: [{ value: 'атлетика' }, { value: 'обман' }] } },
      sample: { 'навыки.атлетика.ранг': 4, 'навыки.обман.ранг': 2 },
    } as unknown as System;
    renameRow(system, 'навыки', 'атлетика', 'сила');
    expect(system.sample).toEqual({ 'навыки.сила.ранг': 4, 'навыки.обман.ранг': 2 });
    expect(texts(system)).toEqual([]);
  });
});
