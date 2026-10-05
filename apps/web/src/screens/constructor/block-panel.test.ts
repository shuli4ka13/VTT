import { describe, it, expect } from 'vitest';
import { newPart, homesOf } from './block-panel.tsx';
import { fieldsByBlock } from '@vtt/engine/model/blocks';
import type { System } from '@vtt/schema';

const system = (): System => ({
  id: 'x', name: 'x', effects: {},
  tables: { лист: { shape: 'single', columns: [
    { key: 'хиты', label: 'Хиты', kind: 'number' }, { key: 'кд', label: 'КД', kind: 'number' }, { key: 'опыт', label: 'Опыт', kind: 'number' },
  ] } },
  blocks: [{ name: 'Здоровье', parts: [{ table: 'лист', columns: ['хиты', 'кд'] }] }, { name: 'Шапка', parts: [{ table: 'лист', columns: ['хиты'] }] }],
} as unknown as System);

describe('одно поле — в нескольких блоках', () => {
  it('новые поля из таблицы — те, что ещё ни в одном блоке', () => {
    expect(newPart(system(), 'лист')).toEqual({ table: 'лист', columns: ['опыт'] });
  });

  it('хиты и в «Здоровье», и в «Шапке»: лист показывает их в обоих блоках', () => {
    const s = system();
    expect(homesOf(s, 'лист', 'хиты')).toEqual(['Здоровье', 'Шапка']);
    const blocks = fieldsByBlock(s);
    expect(blocks.map(([name, fields]) => [name, fields.map(f => f.tag)])).toEqual([
      ['Здоровье', ['хиты', 'кд']],
      ['Шапка', ['хиты']],
      ['Без блока', ['опыт']],
    ]);
  });
});
