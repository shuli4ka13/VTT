import { group, test, eq, ok } from './harness.ts';
import { compile } from '../src/formula/index.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { rowUsers, danglingRows, renameRow, renameRowInBook } from '../src/model/integrity.ts';
import { bindingHolds } from '../src/events/actions.ts';
import type { System, Compendium, Sheet } from '../src/model/types.ts';
import { calc } from '../src/engine/calc.ts';
import { errorsOf, lintSystem } from '../src/model/lint.ts';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

group('ссылка «несколько значений» — многие ко многим', () => {
  test('есть(список, значение) отвечает да или нет', () => {
    const свойства = ['лёгкое', 'фехтовальное'];
    const спросить = (слово: string) => compile(`has(@свойства, '${слово}')`).evaluate(() => свойства);
    eq(спросить('лёгкое'), true);
    eq(спросить('тяжёлое'), false);
  });

  test('у кинжала три свойства, и каждое занимает свою строку таблицы', () => {
    const мир = clone(PLAYABLE_WORLDS[0]!);
    const кинжал = мир.compendium.records!.find(i => i.id === 'dagger')!;
    eq(JSON.stringify(кинжал.cells!.properties), JSON.stringify(['лёгкое', 'фехтовальное', 'метательное']));
    const кто = rowUsers(мир.system as System, 'weapon_properties', 'метательное', мир.compendium as Compendium);
    ok(кто.some(u => u.text.includes('Кинжал')), кто.map(u => u.text).join(' | '));
  });

  test('переименование свойства правит его внутри списков, соседей не трогает', () => {
    const мир = clone(PLAYABLE_WORLDS[0]!);
    const system = мир.system as System;
    const книга = мир.compendium as Compendium;
    renameRow(system, 'weapon_properties', 'метательное', 'бросковое');
    renameRowInBook(system, книга, 'weapon_properties', 'метательное', 'бросковое');
    const кинжал = книга.records!.find(i => i.id === 'dagger')!;
    eq(JSON.stringify(кинжал.cells!.properties), JSON.stringify(['лёгкое', 'фехтовальное', 'бросковое']));
    eq(danglingRows(system, книга).length, 0);
  });

  test('одно пропавшее значение в списке — ошибка словами, с его именем', () => {
    const мир = clone(PLAYABLE_WORLDS[0]!);
    const system = мир.system as System;
    system.tables!.weapon_properties!.rows = system.tables!.weapon_properties!.rows!.filter(r => r.value !== 'лёгкое');
    const висят = danglingRows(system, мир.compendium as Compendium).map(d => d.text);
    ok(висят.some(t => t.includes('Кинжал') && t.includes('лёгкое')), висят.slice(0, 3).join('\n'));
  });
});

group('условие кнопки по колонке основы типа записи', () => {
  test('пустая клетка берёт умолчание колонки основы: «Только если» видит 5 и да', () => {
    const system = {
      id: 'у', name: 'у',
      tables: {
        снаряжение: { shape: 'book', use: 'item', label: 'Снаряжение', columns: [
          { key: 'ammo', label: 'Патроны', kind: 'number', default: 5 },
        ] },
        оружие: { shape: 'book', use: 'item', label: 'Оружие', extends: 'снаряжение', columns: [] },
      },
      effects: { выстрел: { label: 'Выстрел', steps: [] } },
    } as unknown as System;
    const binding = { label: 'Выстрел', effect: 'выстрел', if: { expr: '@ammo > 0' } } as never;
    eq(bindingHolds(system, { id: 'пистолет', table: 'оружие', label: 'Пистолет', cells: {} } as never, binding), true);
    eq(bindingHolds(system, { id: 'пустой', table: 'оружие', label: 'Пустой', cells: { ammo: 0 } } as never, binding), false);
  });
});

group('прибавка навыку, если фракция листа — среди фракций навыка', () => {
  const система = (итог: string) => ({
    id: 'w', name: 'w', constants: {}, effects: {},
    tables: {
      лист: { shape: 'single', columns: [{ kind: 'choice', from: 'фракции', key: 'фракция', label: 'Фракция' }] },
      фракции: { label: 'Фракции', key: 'word', columns: [{ kind: 'number', key: 'мод', label: 'Модификатор' }],
        rows: [{ value: 'инквизиция', cells: { мод: 5 } }, { value: 'флот', cells: { мод: 10 } }] },
      навыки: { label: 'Навыки', owner: 'sheet', key: 'word', columns: [
        { kind: 'choice', from: 'фракции', many: true, key: 'свои', label: 'Фракции навыка' },
        { kind: 'number', key: 'итог', label: 'Итог', expr: { expr: итог } },
      ], rows: [{ value: 'атлетика', cells: { свои: ['инквизиция'] } }, { value: 'стрельба', cells: { свои: ['инквизиция', 'флот'] } }] },
    },
  }) as unknown as System;
  const лист = (фракция?: string) => ({ id: 'я', systemId: 'w', name: 'я', values: фракция ? { фракция } : {}, has: [], effects: [] }) as unknown as Sheet;

  test('по списку дальше не пройти — «Проблемы» говорят подписями, что делать: и у вписанного списка, и у вводимого', () => {
    const вписан = система('10 + @row.свои.мод');
    const вводят = система('10 + @row.свои.мод') as unknown as { tables: Record<string, { rows: Record<string, unknown>[] }> };
    вводят.tables.навыки!.rows[0] = { value: 'атлетика', view: { свои: { default: ['инквизиция'] } } };
    for (const мир of [вписан, вводят as unknown as System]) {
      const [беда] = errorsOf(lintSystem(мир));
      ok(беда, 'ошибка есть');
      ok(беда!.text.includes('в «Фракции навыка» несколько значений'), беда!.text);
      ok(беда!.text.includes('брать «Модификатор»'), беда!.text);
      ok(беда!.text.includes('есть(«Фракции навыка»'), беда!.text);
    }
  });

  test('«есть» сравнивает фракцию листа со списком навыка', () => {
    const верная = система('10 + if(has(@row.свои, @фракция), @фракция.мод, 0)');
    eq(errorsOf(lintSystem(верная)).length, 0);
    eq(calc(верная, лист('инквизиция'), 'навыки.атлетика.итог'), 15);
    eq(calc(верная, лист('флот'), 'навыки.атлетика.итог'), 10);
    eq(calc(верная, лист(), 'навыки.атлетика.итог'), 10);
  });

  test('вписанный в строку список из двух фракций приходит в формулу списком, а не текстом через запятую', () => {
    const верная = система('10 + if(has(@row.свои, @фракция), @фракция.мод, 0)');
    eq(calc(верная, лист('инквизиция'), 'навыки.стрельба.итог'), 15);
    eq(calc(верная, лист('флот'), 'навыки.стрельба.итог'), 20);
    eq(calc(верная, лист('флот'), 'навыки.атлетика.итог'), 10);
  });
});
