import { describe, it, expect } from 'vitest';
import type { System } from '@vtt/schema';
import { rowPicks } from './row-picks.ts';
import seed from '../../guide/seeds/templates.json' with { type: 'json' };

const system = seed as unknown as System;

describe('правка «у каждой строки»: клетка заготовки и условие — выбором', () => {
  it('по «@» предлагается клетка этой строки у поля, чья таблица покрывает все строки', () => {
    const picks = rowPicks(system, 'cell:navyki.*.rang')!;
    const written: string[] = [];
    for (const option of picks.options) option.onPick(piece => piece, { write: text => { written.push(text); }, dismiss: () => {} });
    expect(picks.options.map(option => [option.group, option.label])).toEqual([['эта строка', '«Заготовка» → клетка этой строки']]);
    expect(written).toEqual(['@zagotovka.[@row]']);
  });

  it('в «Только если» — «выбрано»', () => {
    expect(rowPicks(system, 'cell:navyki.*.rang')!.phrases).toEqual([{ expr: 'not empty(@zagotovka)', label: '«Заготовка» выбрано' }]);
  });

  it('у правки обычного поля ничего лишнего', () => {
    expect(rowPicks(system, 'zagotovka')).toBeNull();
  });
});
