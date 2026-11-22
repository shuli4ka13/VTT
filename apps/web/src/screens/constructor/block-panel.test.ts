import { describe, it, expect } from 'vitest';
import { newPart, homesOf, moveBlockTo, moveColumnTo } from './block-panel.tsx';
import { fieldsByBlock } from '@vtt/engine';
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

describe('порядок на листе — перетаскиванием', () => {
  const blocks = () => ({ tables: {}, effects: {}, blocks: [
    { name: 'А', parts: [] }, { name: 'Б', parts: [] }, { name: 'В', parts: [] }, { name: 'В1', parent: 'В', parts: [] },
  ] } as unknown as System);

  it('блок встаёт перед или после того, на который его бросили', () => {
    const s = blocks();
    moveBlockTo(s, 'В', 'А', false);
    expect(s.blocks!.map(b => b.name)).toEqual(['В', 'А', 'Б', 'В1']);
    moveBlockTo(s, 'В', 'Б', true);
    expect(s.blocks!.map(b => b.name)).toEqual(['А', 'Б', 'В', 'В1']);
  });

  it('брошенный рядом с вложенным блоком становится его соседом внутри, а в собственного потомка — не бросается', () => {
    const s = blocks();
    moveBlockTo(s, 'А', 'В1', false);
    expect(s.blocks!.find(b => b.name === 'А')!.parent).toBe('В');
    const before = s.blocks!.map(b => `${b.name}:${b.parent ?? ''}`);
    moveBlockTo(s, 'В', 'В1', true);
    expect(s.blocks!.map(b => `${b.name}:${b.parent ?? ''}`)).toEqual(before);
  });

  it('колонка в блоке встаёт на место той, на которую её бросили; порядок пишется в раскладку', () => {
    const part = { table: 'лист' } as { table: string; columns?: string[] };
    moveColumnTo(part, ['хиты', 'кд', 'скорость'], 'скорость', 'хиты', false);
    expect(part.columns).toEqual(['скорость', 'хиты', 'кд']);
    moveColumnTo(part, ['хиты', 'кд', 'скорость'], 'скорость', 'кд', true);
    expect(part.columns).toEqual(['хиты', 'кд', 'скорость']);
  });
});
