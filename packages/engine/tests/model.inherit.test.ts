import { group, test, eq, deepEq, ok } from './harness.ts';
import { familyColumnKeys, flattenSystem, hasBases } from '../src/model/inherit.ts';
import { lintSystem } from '../src/model/lint.ts';
import type { System } from '../src/model/types.ts';

const sys = (effects: Record<string, unknown>, records: Record<string, unknown> = {}): System => ({
  id: 'о', name: 'о', tables: records, effects,
} as unknown as System);

group('у эффекта основы нет: общее вызывается шагом', () => {
  const system = () => sys({
    заклинание: { label: 'Заклинание', params: [{ key: 'круг', label: 'Круг', kind: 'number' }], steps: [] },
    огненный_шар: { extends: 'заклинание', label: 'Огненный шар', steps: [] },
  });

  test('развёртка эффекты не склеивает', () => {
    eq(flattenSystem(system()).effects.огненный_шар!.params, undefined);
  });

  test('линт называет «на основе» у эффекта ошибкой', () => {
    const texts = lintSystem(system()).filter(p => p.level === 'error').map(p => p.text);
    ok(texts.some(t => t.includes('«на основе» у эффекта больше нет')), texts.join(' | '));
  });
});

group('основа: тип записи', () => {
  test('свойства копятся, привязка по счёту доправляет аргументы и может смениться именем', () => {
    const flat = flattenSystem(sys({ удар: { label: 'Удар' } }, {
      оружие: {
        shape: 'book', use: 'item', label: 'Оружие',
        columns: [{ key: 'кость', label: 'Кость урона' }, { key: 'тип', label: 'Тип урона' }],
        bindings: [{ label: 'Удар', effect: 'удар', args: { чем: '#сила', кость: { expr: '@кость' } } }],
      },
      фехтовальное: {
        shape: 'book', use: 'item', extends: 'оружие', label: 'Оружие фехтовальное',
        bindings: [{ label: 'Выстрел', effect: 'удар', args: { чем: '#ловкость' } }],
      },
    }));

    const ф = flat.tables!.фехтовальное!;
    eq(ф.label, 'Оружие фехтовальное');
    eq(ф.columns?.length, 2, 'оба свойства достались от основы');
    eq(ф.bindings?.length, 1, 'привязка не задвоилась');
    eq(ф.bindings?.[0]?.label, 'Выстрел', 'кнопку можно переназвать');
    deepEq(ф.bindings?.[0]?.args, { чем: '#ловкость', кость: { expr: '@кость' } });
  });
});

group('основ нет — система не трогается', () => {
  test('без «на основе» возвращается тот же объект', () => {
    const плоская = sys({ а: { label: 'А' } });
    eq(hasBases(плоская), false);
    eq(flattenSystem(плоская), плоская);
  });
});

group('ключи колонок по цепочке типа', () => {
  const column = (key: string) => ({ key, label: key, kind: 'number' });
  const system = {
    tables: {
      base: { shape: 'book', label: 'Основа', columns: [column('a')] },
      child: { shape: 'book', label: 'Наследник', extends: 'base', columns: [column('b')] },
      grand: { shape: 'book', label: 'Внук', extends: 'child', columns: [column('c')] },
      aside: { shape: 'book', label: 'Сосед', extends: 'base', columns: [column('d')] },
      other: { shape: 'book', label: 'Чужой', columns: [column('e')] },
    },
  } as unknown as System;

  test('у типа заняты ключи основ и всех наследников, соседние ветки и чужие типы — нет', () => {
    deepEq(familyColumnKeys(system, 'child').sort(), ['a', 'b', 'c']);
    deepEq(familyColumnKeys(system, 'base').sort(), ['a', 'b', 'c', 'd']);
    deepEq(familyColumnKeys(system, 'aside').sort(), ['a', 'd']);
    deepEq(familyColumnKeys(system, 'other'), ['e']);
  });

  test('круг в основах не вешает расчёт', () => {
    const loop = { tables: { x: { shape: 'book', extends: 'y', columns: [column('p')] }, y: { shape: 'book', extends: 'x', columns: [column('q')] } } } as unknown as System;
    deepEq(familyColumnKeys(loop, 'x').sort(), ['p', 'q']);
    eq(familyColumnKeys(loop, 'нет такого').length, 0);
    ok(hasBases(loop));
  });
});
