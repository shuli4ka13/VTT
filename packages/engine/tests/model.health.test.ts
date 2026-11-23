import { describe, it, expect } from 'vitest';
import { healthOf, healthSteps, shareOf } from '../src/model/health.ts';
import { lintSystem } from '../src/model/lint.ts';
import { renameLayoutColumn, renameLayoutTable, retagFields } from '../src/model/layout.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import type { System, Sheet } from '../src/model/types.ts';

const system = {
  id: 'здоровье', name: 'Здоровье',
  tables: {
    лист: { shape: 'single', owner: 'sheet', label: 'Лист', columns: [
      { key: 'раны', label: 'Раны', kind: 'number', default: { expr: '@раны_макс' }, min: 0 },
      { key: 'стойкость', label: 'Стойкость', kind: 'number', default: 3 },
      { key: 'раны_макс', label: 'Предел ран', expr: { expr: '@стойкость * 4' } },
    ] },
    ступени: { label: 'Ступени здоровья', key: 'word', columns: [
      { key: 'от', label: 'От доли, %', kind: 'number' },
      { key: 'при', label: 'При состоянии', kind: 'effect' },
    ], rows: [
      { value: 'мёртв', label: 'мёртв', cells: { при: 'мёртв' } },
      { value: 'без_сознания', label: 'без сознания', cells: { при: 'без_сознания' } },
      { value: 'цел', label: 'цел', cells: { от: 100 } },
      { value: 'ранен', label: 'ранен', cells: { от: 50 } },
      { value: 'тяжело', label: 'тяжело ранен', cells: { от: 0 } },
    ] },
  },
  effects: {
    мёртв: { label: 'Мёртв', activation: 'passive' },
    без_сознания: { label: 'Без сознания', activation: 'passive' },
  },
  health: { value: 'раны', max: 'раны_макс', steps: { table: 'ступени', from: 'от', state: 'при' } },
} as unknown as System;

const sheet = (values: Record<string, unknown> = {}, effects: string[] = []): Sheet =>
  ({ id: 'г', systemId: 'здоровье', name: 'Герой', values, has: [], effects: effects.map(effectId => ({ effectId })) } as Sheet);

describe('здоровье: объявление системы', () => {
  it('без объявления здоровья у листа нет', () => {
    const { health: _none, ...plain } = system as System & { health?: unknown };
    expect(healthOf(plain as System, sheet())).toBeNull();
  });

  it('нетронутое здоровье равно максимуму: доля 100, ступень «цел»', () => {
    expect(healthOf(system, sheet())).toEqual({ value: 12, max: 12, share: 100, step: { key: 'цел', label: 'цел', at: 2 } });
  });

  it('ступень — первая сверху, чья доля не выше доли здоровья; доля округляется вниз', () => {
    expect(healthOf(system, sheet({ раны: 11 }))).toMatchObject({ share: 91, step: { label: 'ранен' } });
    expect(healthOf(system, sheet({ раны: 6 }))).toMatchObject({ share: 50, step: { label: 'ранен' } });
    expect(healthOf(system, sheet({ раны: 5 }))).toMatchObject({ share: 41, step: { label: 'тяжело ранен' } });
    expect(healthOf(system, sheet({ раны: 0 }))).toMatchObject({ share: 0, step: { label: 'тяжело ранен' } });
  });

  it('состояние побеждает долю, а верхнее состояние — нижнее', () => {
    expect(healthOf(system, sheet({ раны: 12 }, ['без_сознания']))).toMatchObject({ share: 100, step: { label: 'без сознания' } });
    expect(healthOf(system, sheet({ раны: 0 }, ['без_сознания', 'мёртв']))).toMatchObject({ step: { label: 'мёртв' } });
  });

  it('максимум ноль или не число — доли нет, ступень только по состоянию', () => {
    expect(healthOf(system, sheet({ стойкость: 0 }))).toEqual({ value: 0, max: 0, share: null, step: null });
    expect(healthOf(system, sheet({ стойкость: 0 }, ['мёртв']))).toMatchObject({ share: null, step: { label: 'мёртв' } });
    expect(shareOf(5, null)).toBeNull();
    expect(shareOf(-3, 10)).toBe(0);
  });

  it('ступени читаются из таблицы по порядку строк', () => {
    expect(healthSteps(system).map(one => [one.step.label, one.from, one.state])).toEqual([
      ['мёртв', null, 'мёртв'], ['без сознания', null, 'без_сознания'], ['цел', 100, null], ['ранен', 50, null], ['тяжело ранен', 0, null],
    ]);
  });
});

describe('здоровье: образец D&D', () => {
  const dnd = PLAYABLE_WORLDS.find(world => (world.system as System).id === 'dnd5e')!;
  const dndSystem = dnd.system as System;
  const of = (id: string, patch: Record<string, unknown> = {}, effects: string[] = []): Sheet => {
    const base = structuredClone(dnd.sheets.find(one => one.id === id)!) as Sheet;
    return { ...base, values: { ...base.values, ...patch }, effects: [...(base.effects ?? []), ...effects.map(effectId => ({ effectId }))] } as Sheet;
  };
  const health = (one: Sheet) => healthOf(dndSystem, one, { compendium: dnd.compendium });

  it('система объявляет хиты, максимум и ступени', () => {
    expect(healthSteps(dndSystem).map(one => one.step.label)).toEqual(['мёртв', 'при смерти', 'без сознания', 'цел', 'ранен', 'тяжело ранен']);
  });

  it('полные хиты — «цел», половина — «ранен», меньше половины — «тяжело ранен»', () => {
    const full = health(of('arven'))!;
    expect(full).toMatchObject({ value: 49, max: 49, share: 100, step: { label: 'цел' } });
    expect(health(of('arven', { hp_current: 25 }))).toMatchObject({ share: 51, step: { label: 'ранен' } });
    expect(health(of('arven', { hp_current: 24 }))).toMatchObject({ share: 48, step: { label: 'тяжело ранен' } });
  });

  it('состояние «без сознания» побеждает долю, «при смерти» — «без сознания», «мёртв» — всё', () => {
    expect(health(of('arven', { hp_current: 0 }, ['unconscious']))).toMatchObject({ step: { label: 'без сознания' } });
    expect(health(of('arven', { hp_current: 0 }, ['unconscious', 'dying']))).toMatchObject({ step: { label: 'при смерти' } });
    expect(health(of('arven', { hp_current: 0 }, ['unconscious', 'dying', 'dead']))).toMatchObject({ step: { label: 'мёртв' } });
  });
});

describe('здоровье: «Проблемы»', () => {
  type Loose = Record<string, any>;
  const made = (change: (draft: Loose) => void): System => {
    const draft = structuredClone(system) as unknown as Loose;
    change(draft);
    return draft as unknown as System;
  };
  const found = (one: System, level: 'error' | 'warn') =>
    lintSystem(one).filter(problem => problem.level === level && problem.where.section === 'vitals').map(problem => problem.text);

  it('верное объявление — без замечаний', () => {
    expect(lintSystem(system)).toEqual([]);
  });

  it('поля нет, поле — не число, поле стола — ошибки', () => {
    expect(found(made(draft => { draft.health.value = 'нет_такого'; }), 'error').some(text => text.includes('«нет_такого»'))).toBe(true);
    const worded = made(draft => { draft.tables.лист.columns.push({ key: 'имя', label: 'Имя', kind: 'text' }); draft.health.max = 'имя'; });
    expect(found(worded, 'error').some(text => text.includes('«Имя» — не число'))).toBe(true);
    const desk = made(draft => { draft.tables.сцена = { shape: 'single', owner: 'desk', label: 'Сцена', columns: [{ key: 'страх', label: 'Страх', kind: 'number' }] }; draft.health.value = 'страх'; });
    expect(found(desk, 'error').some(text => text.includes('поле стола'))).toBe(true);
  });

  it('таблицы ступеней нет, она не справочник, колонки не те — ошибки', () => {
    expect(found(made(draft => { draft.health.steps.table = 'нет'; }), 'error').some(text => text.includes('таблицы ступеней «нет»'))).toBe(true);
    expect(found(made(draft => { draft.tables.ступени.owner = 'sheet'; }), 'error').some(text => text.includes('справочной таблицы'))).toBe(true);
    expect(found(made(draft => { draft.health.steps.from = 'мимо'; }), 'error').some(text => text.includes('нет колонки доли «мимо»'))).toBe(true);
    expect(found(made(draft => { draft.health.steps.state = 'от'; }), 'error').some(text => text.includes('должна быть вида «эффект»'))).toBe(true);
  });

  it('доли не по убыванию, состояние ниже долей, нет ступени «от 0», пустая ступень — замечания', () => {
    const swapped = made(draft => { const rows = draft.tables.ступени.rows; [rows[3], rows[4]] = [rows[4], rows[3]]; });
    expect(found(swapped, 'warn').some(text => text.includes('«ранен»') && text.includes('от большей к меньшей'))).toBe(true);
    const low = made(draft => { const rows = draft.tables.ступени.rows; rows.push(rows.shift()); });
    expect(found(low, 'warn').some(text => text.includes('ступень-состояние «мёртв»'))).toBe(true);
    const gap = made(draft => { draft.tables.ступени.rows.pop(); });
    expect(found(gap, 'warn').some(text => text.includes('не начинается с нуля'))).toBe(true);
    const empty = made(draft => { draft.tables.ступени.rows.push({ value: 'пусто', label: 'пусто' }); });
    expect(found(empty, 'warn').some(text => text.includes('«пусто» не сработает никогда'))).toBe(true);
    expect(found(swapped, 'error')).toEqual([]);
  });

  it('ссылки здоровья идут за переименованием поля, таблицы и колонки', () => {
    const draft = structuredClone(system) as unknown as System;
    retagFields(draft, tag => (tag === 'раны' ? 'здоровье' : tag));
    renameLayoutTable(draft, 'ступени', 'шкала');
    renameLayoutColumn(draft, 'шкала', 'от', 'доля');
    renameLayoutColumn(draft, 'шкала', 'при', 'состояние');
    expect(draft.health).toEqual({ value: 'здоровье', max: 'раны_макс', steps: { table: 'шкала', from: 'доля', state: 'состояние' } });
  });
});

