import { group, test, eq, ok, deepEq } from './harness.ts';
import { walkSheet, walkColumns } from '../src/model/paths.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import { namesAt } from '../src/model/names-at.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { fieldsOf } from '../src/model/sheet-columns.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import type { System } from '../src/model/types.ts';

const dnd = () => structuredClone(PLAYABLE_WORLDS.find(world => world.system.id === 'dnd5e')!);
const errors = (system: System) => errorsOf(lintSystem(system)).map(p => p.text);
const fresh = (edit: (system: System) => void): string[] => {
  const world = dnd();
  edit(world.system as System);
  return errors(world.system as System);
};

group('справочная путей', () => {
  test('поле, адрес в таблице и путь за полем-ссылкой читаются словами', () => {
    const { system } = dnd();
    deepEq(walkSheet(system as System, 'abilities.ловкость.mod'), { ok: true, label: 'Модификатор: Ловкость' });
    deepEq(walkSheet(system as System, 'class_name.spell_ability.mod'), { ok: true, label: 'Класс → Заклинательная характеристика → Модификатор' });
    deepEq(walkSheet(system as System, 'нет_такого'), null);
  });

  test('опечатка в строке или колонке — ошибка словами, не пусто', () => {
    const { system } = dnd();
    deepEq(walkSheet(system as System, 'abilities.ловкость.modd'), { ok: false, text: 'у таблицы «Характеристики» нет колонки «modd»' });
    deepEq(walkSheet(system as System, 'abilities.ловкостьь.mod'), { ok: false, text: 'в таблице «Характеристики» нет строки «ловкостьь»' });
    eq((walkSheet(system as System, 'class_name.spell_ability.modd') as { text: string }).text, 'у таблицы «Характеристики» нет колонки «modd»');
  });

  test('колонки строки идут по ссылкам дальше', () => {
    const { system } = dnd();
    deepEq(walkColumns(system as System, 'resources', ['left']), { ok: true, label: 'Осталось' });
    ok(!walkColumns(system as System, 'resources', ['leftt']).ok);
  });
});

group('проверка ловит опечатки в путях', () => {
  test('образец чист', () => eq(errors(dnd().system as System).join('\n'), ''));

  test('колонка и строка поля-таблицы — в правке, шаге и колонке листа', () => {
    ok(fresh(s => { s.effects.unarmored_monk!.modifiers![0]!.value = { expr: '10 + @abilities.мудрость.modd' } as never; }).includes('у таблицы «Характеристики» нет колонки «modd»'));
    ok(fresh(s => { (s.effects.hide!.steps![0] as { bonus: unknown }).bonus = { expr: '@действующий.skills.скрытность.totall' }; }).includes('у таблицы «Навыки» нет колонки «totall»'));
    ok(fresh(s => { s.tables!['лист']!.columns![9]!.expr = { expr: '@abilities.ловкостьь.mod' } as never; }).includes('в таблице «Характеристики» нет строки «ловкостьь»'));
    ok(fresh(s => { s.tables!['лист']!.columns![35]!.expr = { expr: '@class_name.spell_ability.modd или 0' } as never; }).includes('у таблицы «Характеристики» нет колонки «modd»'));
  });

  test('литерал во входе-выборе сверяется со строками таблицы', () => {
    const found = fresh(s => {
      const step = s.effects.turn_undead!.steps!.find(one => (one as { effect?: string }).effect === 'saving_throw') as { args: Record<string, { expr: string }> };
      step.args['характеристика'] = { expr: '"мудростьь"' };
    });
    ok(found.includes('во вход «Чем спасается» вызова «Спасбросок» передано «мудростьь» — в таблице «Характеристики» такой строки нет'), found.join('\n'));
  });

  test('опечатка в имени строки цикла называет настоящее имя', () => {
    const found = fresh(s => { (s.effects.resources_rest!.on![0]!.steps![1] as { if: unknown }).if = { expr: '@носитель.ресурсы.short' }; });
    ok(found.some(text => text.startsWith('у листа нет поля «ресурсы»; здесь есть «ресурс»')), found.join('\n'));
  });
});

group('имена места знают колонки строк', () => {
  test('строка цикла и вход-выбор — с колонками таблицы', () => {
    const { system } = dnd();
    const loop = namesAt(system as System, 'resources_rest', { part: 'handler', handler: 0, index: 2 }).find(one => one.name === 'ресурс');
    ok(loop?.children?.some(child => child.path === '.left' && child.label === 'Осталось'));
    const choice = namesAt(system as System, 'turn_spend', { part: 'steps', index: 1 }).find(one => one.name === 'что');
    ok(choice?.children?.some(child => child.path === '.left'));
  });

  test('затравка по метке подписана вызванным эффектом', () => {
    const { system } = dnd();
    const heard = namesAt(system as System, 'shield', { part: 'handler-if', handler: 0 }).find(one => one.name === 'бросок');
    eq(heard?.label, 'Бросок атаки');
    ok(heard?.children?.some(child => child.path === '.исход.hit' && child.kind === 'boolean'));
  });
});

group('расчёт не молчит об опечатке в адресе', () => {
  test('неизвестная колонка — ошибка, а не пусто', () => {
    const world = dnd();
    const system = world.system as System;
    system.tables!['лист']!.columns![9]!.expr = { expr: '@abilities.ловкость.modd' } as never;
    const sheet = world.sheets[0]!;
    let said = '';
    try { calc(system, sheet, 'initiative', newPass(system, sheet)); } catch (err) { said = (err as Error).message; }
    ok(said.includes('нет колонки «modd»'), said);
  });

  test('листы образцов считаются без ошибок «нет колонки»', () => {
    for (const world of PLAYABLE_WORLDS) {
      const system = world.system as System;
      for (const sheet of world.sheets ?? []) {
        const pass = newPass(system, sheet, { compendium: world.compendium });
        for (const field of fieldsOf(system)) {
          try { calc(system, sheet, field.tag, pass); } catch (err) {
            ok(!(err as Error).message.includes('нет колонки'), `${system.name} · ${sheet.name} · ${field.tag}: ${(err as Error).message}`);
          }
        }
      }
    }
  });
});

group('неизвестная функция — ошибка проверки, а не расчёта', () => {
  test('«все(…)» больше нет — проверка говорит, какой функции нет', () => {
    const found = fresh(s => { (s.effects.resources_rest!.on![0]!.steps![1] as { if: unknown }).if = { expr: 'все(@носитель.ресурс.short, да)' }; });
    ok(found.some(text => text.includes('нет функции «все»')), found.join('\n'));
  });
});
