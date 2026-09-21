import { group, test, eq, deepEq, ok } from './harness.ts';
import { unifyBlocks, blockNames, NO_BLOCK } from '../src/model/blocks.ts';
import type { System } from '../src/model/types.ts';

const sys = (over: Record<string, unknown>): System => ({
  id: 'б', name: 'б', fields: [], effects: {}, records: {}, ...over,
} as unknown as System);

group('блок — одно понятие на поля, эффекты и типы записей', () => {
  test('старая «категория» эффекта становится блоком', () => {
    const было = sys({ effects: { удар: { label: 'Удар', category: 'Атака' } } });
    const стало = unifyBlocks(было);
    const удар = стало.effects.удар as Record<string, unknown>;
    eq(удар.group, 'Атака');
    eq(удар.category, undefined, 'старого слова не остаётся');
  });

  test('имена блоков со всех трёх сторон попадают в общий реестр', () => {
    const стало = unifyBlocks(sys({
      fields: [{ tag: 'сила', label: 'Сила', group: 'Характеристики', value: { kind: 'stored', type: 'number', default: 10 } }],
      effects: { удар: { label: 'Удар', category: 'Атака' } },
      records: { меч: { kind: 'item', label: 'Меч', group: 'Снаряжение' } },
    }));
    deepEq(Object.keys(стало.groups ?? {}).sort(), ['Атака', 'Снаряжение', 'Характеристики']);
  });

  test('заведённый блок не затирается и держит родителя', () => {
    const стало = unifyBlocks(sys({
      groups: { Магия: {}, Заклинания: { parent: 'Магия' } },
      effects: { шар: { label: 'Шар', category: 'Заклинания' } },
    }));
    eq(стало.groups?.Заклинания?.parent, 'Магия');
  });

  test('блоков нет — система возвращается та же', () => {
    const плоская = sys({ groups: {}, effects: { а: { label: 'А' } } });
    eq(unifyBlocks(плоская), плоская);
  });

  test('имена читаются и до переливки, и после', () => {
    const было = sys({ effects: { удар: { label: 'Удар', category: 'Атака' } } });
    ok(blockNames(было).includes('Атака'), 'старое слово видно');
    ok(blockNames(unifyBlocks(было)).includes('Атака'), 'новое тоже');
    eq(NO_BLOCK, 'Без блока');
  });
});
