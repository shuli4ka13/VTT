import { group, test, eq, ok } from './harness.ts';
import { blockNames, NO_BLOCK } from '../src/model/blocks.ts';
import type { System } from '../src/model/types.ts';

const sys = (over: Record<string, unknown>): System => ({
  id: 'б', name: 'б', tables: {  }, effects: {},  ...over,
} as unknown as System);

group('блок — одно понятие на поля, эффекты и типы записей', () => {
  test('имена блоков собираются со всех трёх сторон', () => {
    const names = blockNames(sys({
      tables: { лист: { shape: 'single', columns: [{ key: 'сила', label: 'Сила', kind: 'number', default: 10 }] } , меч: { shape: 'book', use: 'item', label: 'Меч', block: 'Снаряжение' } },
      blocks: [{ key: 'Характеристики', parts: [{ table: 'лист', columns: ['сила'] }] }],
      effects: { удар: { label: 'Удар', group: 'Атака' } },
      
    }));
    ok(['Атака', 'Снаряжение', 'Характеристики'].every(name => names.includes(name)), names.join(', '));
    eq(NO_BLOCK, 'Без блока');
  });
});
