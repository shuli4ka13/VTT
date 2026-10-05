import { describe, it, expect } from 'vitest';
import { rowWords, rowSteps } from '../src/model/sheet-columns.ts';
import { SAMPLE_SYSTEMS } from '../src/model/systems.ts';
import type { System } from '../src/model/types.ts';

const dnd = SAMPLE_SYSTEMS.find(s => s.id === 'dnd5e') as unknown as System;
const skills = dnd.tables!.skills!;
const row = (key: string) => skills.rows!.find(r => r.value === key)!;
const total = skills.columns!.find(c => c.key === 'total')!.expr!.expr;

describe('формула колонки словами для строки', () => {
  it('у каждой строки своя: ссылка на характеристику раскрыта подписью её строки', () => {
    expect(rowWords(dnd, 'skills', row('атлетика'), total)).toBe('Сила · Модификатор + Владение × Бонус мастерства');
    expect(rowWords(dnd, 'skills', row('скрытность'), total)).toBe('Ловкость · Модификатор + Владение × Бонус мастерства');
  });

  it('путь по строке объяснён шагами: колонка, таблица, куда ведёт ссылка', () => {
    expect(rowSteps(dnd, 'skills', ['ability', 'mod'], row('атлетика'))).toEqual([
      { column: 'Характеристика', table: 'Навыки', key: 'skills', via: 'Сила' },
      { column: 'Модификатор', table: 'Характеристики', key: 'abilities' },
    ]);
  });
});
