// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';
import { fieldsOf, fieldOf } from '@vtt/engine/model/sheet-columns';
import { newPass, calc } from '@vtt/engine/engine/calc';
import { SheetView } from './sheet-view.tsx';
import type { Reader } from '../engine/use-calc.ts';

const world = SAMPLE_WORLDS.find(w => w.system.id === 'dnd5e')!;
const system = world.system;
const hero = world.sheets.find(sheet => sheet.id === 'arven')!;

describe('D&D: однотипное лежит таблицами, а не россыпью колонок', () => {
  afterEach(() => { cleanup(); });

  it('счётчики хода — строки таблицы «За ход», у каждой свой потолок и начало', () => {
    const turn = fieldsOf(system).filter(field => field.home === 'turn');
    expect(turn.map(field => field.label)).toEqual(['Действие', 'Бонусное действие', 'Реакция', 'Раз за ход', 'Атак осталось']);
    const action = fieldOf(system, 'turn.действие.left')!;
    expect(action.value).toMatchObject({ kind: 'stored', default: 1, max: '2' });

    const pass = newPass(system, hero, { compendium: world.compendium });
    const reader: Reader = { valueOf: tag => ({ ok: true, value: calc(system, hero, tag, pass) }), rollOf: () => null };
    render(<SheetView system={system} sheet={hero} reader={reader} fields={turn} onChange={() => undefined} />);
    expect(document.querySelectorAll('.sheet-table').length).toBe(1);
    expect(document.body.textContent).toContain('Бонусное действие');
  });

  it('стойкость к урону — одна колонка у типов урона, спасбросок — колонка характеристик', () => {
    expect(fieldsOf(system).filter(field => field.cell?.column === 'taken').length).toBe(13);
    expect(fieldOf(system, 'damage_types.огонь.taken')!.value).toMatchObject({ type: 'choice', from: 'taken', default: 'как есть' });
    expect(fieldOf(system, 'abilities.сила.save')!.label).toBe('Спасбросок: Сила');
    expect(system.tables!.saves).toBeUndefined();
    expect(fieldsOf(system).some(field => /^taken_\d+$|^turn_/.test(field.tag))).toBe(false);
    const pass = newPass(system, hero, { compendium: world.compendium });
    expect(calc(system, hero, 'abilities.сила.save', pass)).toBe(calc(system, hero, 'abilities.сила.mod', pass) as number + (calc(system, hero, 'prof_bonus', pass) as number));
  });
});
